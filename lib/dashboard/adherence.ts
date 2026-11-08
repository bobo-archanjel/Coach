import { createClient } from "@/lib/supabase/server";
import { scaleFoodMacros, sumMacros } from "@/lib/meals";

// Adherencia stravy pre trénera (`/dashboard/klienti/[id]`) — analogický follow-up
// ku karte tréningovej aktivity, len na strane výživy. Číta food_logs (0007) +
// nutrition_profiles (0004); RLS food_logs_select_own_trainer to už dovoľuje,
// žiadna nová migrácia. Rovnaká TZ konvencia ako lib/portal/data.ts (Europe/Bratislava).

const TZ = "Europe/Bratislava";
const WEEKDAY_LABELS = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];
const HISTORY_DAYS = 7;
/** 85–115 % cieľa = "v poriadku" — rovnaká hranica ako 7-dňový pás bodiek (adherenceGood). */
export const ON_TRACK_MIN_PCT = 85;
export const ON_TRACK_MAX_PCT = 115;

type FoodLogRow = {
  eaten_on: string;
  grams: number;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
};

export interface AdherenceDay {
  label: string;
  dateNum: number;
  /** null = žiadny záznam ten deň (nerozlišuje sa od "0 kcal", ale to sa v praxi nestáva) */
  pct: number | null;
}

/** % dní "v poriadku" (85–115 % cieľa) v okne — pre 30/90-dňový trend na klientovi aj `/dashboard/analytika`. */
export interface AdherenceWindow {
  /** null keď klient nemá makro cieľ — bez cieľa "v poriadku" nedáva zmysel */
  pct: number | null;
  onTrackDays: number;
  totalDays: number;
}

export interface NutritionAdherence {
  hasGoal: boolean;
  kcalGoal: number | null;
  todayKcal: number;
  /** zaokrúhlené % z cieľa, null keď cieľ nie je nastavený */
  todayPct: number | null;
  /** posledných 7 dní vrátane dneška, najstarší prvý */
  days: AdherenceDay[];
  window30: AdherenceWindow;
  window90: AdherenceWindow;
}

/** Nakoľko sa odcvičený tréning zhoduje s predpísaným plánom (série/opakovania/váha) v okne. */
export interface PlanCompletionWindow {
  /** priemerné % splnenia predpisu naprieč hodnotenými tréningmi; null = žiadny tréning sa nedal ohodnotiť */
  pct: number | null;
  /** koľko odcvičených tréningov v okne malo naviazaný plánovaný deň s cvikmi (a teda sa dalo ohodnotiť) */
  sessionsScored: number;
}

/** % dní s aspoň jedným odcvičeným tréningom v okne — bez cieľa, klient si sám volí kedy cvičí (rotačný model). */
export interface TrainingAdherence {
  window30: { pct: number; trainedDays: number; totalDays: number };
  window90: { pct: number; trainedDays: number; totalDays: number };
  /**
   * Doplnková metrika k binárnej adherencii (feature/analytika-v2, bod 2): binárna
   * hovorí len "v ten deň niečo odcvičil", plan completion hovorí "odcvičil to, čo
   * bolo v pláne" — porovná skutočné série/opakovania/váhu (workout_logs.entries)
   * s predpisom z buildera (workout_days.exercises). Nenahrádza binárnu metriku.
   */
  planCompletion: { window30: PlanCompletionWindow; window90: PlanCompletionWindow };
}

export function todayInTz(): { isoDate: string; base: Date } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const isoDate = `${get("year")}-${get("month")}-${get("day")}`;
  return { isoDate, base: new Date(`${isoDate}T12:00:00Z`) };
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

export function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const WINDOW_90_DAYS = 90;

/** % dní v posledných `windowDays` (vrátane dneška), kde bol príjem 85–115 % cieľa. */
function computeWindow(kcalByDate: Map<string, number>, kcalGoal: number | null, base: Date, windowDays: number): AdherenceWindow {
  if (!kcalGoal) return { pct: null, onTrackDays: 0, totalDays: windowDays };
  let onTrack = 0;
  for (let i = 0; i < windowDays; i++) {
    const kcal = kcalByDate.get(iso(addDays(base, -i)));
    if (kcal == null) continue;
    const pct = (kcal / kcalGoal) * 100;
    if (pct >= ON_TRACK_MIN_PCT && pct <= ON_TRACK_MAX_PCT) onTrack++;
  }
  return { pct: Math.round((onTrack / windowDays) * 100), onTrackDays: onTrack, totalDays: windowDays };
}

/**
 * Adherencia stravy jedného klienta — 7-dňový pás (karta na `/dashboard/klienti/[id]`)
 * plus 30/90-dňový trend (tá istá karta + `/dashboard/analytika`). Jeden dotaz na
 * `food_logs` pokrýva najširšie okno (90 dní), z neho sa odvodia všetky tri.
 * Vracia `null` len pri chybe načítania (klient bez makro cieľa dostane
 * `hasGoal: false`, nie null — to nie je chyba).
 */
export async function getNutritionAdherence(clientId: string): Promise<NutritionAdherence | null> {
  const supabase = await createClient();
  const { isoDate, base } = todayInTz();
  const historyStart = iso(addDays(base, -(WINDOW_90_DAYS - 1)));

  const [{ data: profile, error: profileErr }, { data: logRows, error: logErr }] = await Promise.all([
    supabase.from("nutrition_profiles").select("calories_target").eq("client_id", clientId).maybeSingle(),
    supabase
      .from("food_logs")
      .select("eaten_on, grams, kcal_100g, protein_100g, carbs_100g, fat_100g")
      .eq("client_id", clientId)
      .gte("eaten_on", historyStart)
      .lte("eaten_on", isoDate),
  ]);

  if (profileErr || logErr) return null;

  const kcalGoal = profile?.calories_target ?? null;
  const rows = (logRows ?? []) as FoodLogRow[];

  const kcalByDate = new Map<string, number>();
  for (const r of rows) {
    const macros = scaleFoodMacros(
      { kcal_100g: r.kcal_100g, protein_100g: r.protein_100g, carbs_100g: r.carbs_100g, fat_100g: r.fat_100g },
      r.grams,
    );
    kcalByDate.set(r.eaten_on, (kcalByDate.get(r.eaten_on) ?? 0) + sumMacros([macros]).kcal);
  }

  const days: AdherenceDay[] = [];
  for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
    const date = addDays(base, -i);
    const dateStr = iso(date);
    const kcal = kcalByDate.get(dateStr);
    const pct = kcal != null && kcalGoal ? Math.round((kcal / kcalGoal) * 100) : null;
    const weekdayIdx = (date.getUTCDay() + 6) % 7; // 0 = pondelok
    days.push({ label: WEEKDAY_LABELS[weekdayIdx], dateNum: date.getUTCDate(), pct });
  }

  const todayKcal = kcalByDate.get(isoDate) ?? 0;
  const todayPct = kcalGoal ? Math.round((todayKcal / kcalGoal) * 100) : null;

  return {
    hasGoal: kcalGoal != null,
    kcalGoal,
    todayKcal,
    todayPct,
    days,
    window30: computeWindow(kcalByDate, kcalGoal, base, 30),
    window90: computeWindow(kcalByDate, kcalGoal, base, 90),
  };
}

/** Tvar cviku v pláne (workout_days.exercises JSONB) — zhodný s ExerciseEntry v lib/portal/data.ts. */
type PlannedExercise = {
  entry_id?: string | null;
  exercise_name?: string | null;
  sets?: number | null;
  reps?: string | null;
  load_kg?: number | null;
};

/** Jedna skutočne odcvičená séria (workout_logs.entries[].sets[]). */
type PerformedSet = { reps: number | null; weight: number | null };

/** Spodná hranica plánovaných opakovaní z reťazca buildera: "8" → 8, "8-10" → 8, "AMRAP" → null. */
function plannedRepsFloor(reps: string | null | undefined): number | null {
  if (!reps) return null;
  const m = reps.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function normName(name: string | null | undefined): string {
  return (name ?? "").trim().toLocaleLowerCase("sk");
}

/**
 * Skóre splnenia jedného plánovaného cviku (0–1): priemer dostupných zložiek —
 * série (odcvičené/plánované), opakovania (koľko sérií dosiahlo spodnú hranicu
 * reps) a váha (koľko sérií dosiahlo load_kg). Prekročenie predpisu = 1, nie viac
 * (progresívne preťaženie je cieľ, nie odchýlka). Cvik bez load_kg (vlastná váha)
 * sa hodnotí len na sériách + opakovaniach. Plánovaný, ale vôbec neodcvičený cvik = 0.
 */
function plannedExerciseScore(planned: PlannedExercise, performed: PerformedSet[] | null): number {
  const plannedSets = planned.sets && planned.sets > 0 ? planned.sets : 1;
  if (!performed || performed.length === 0) return 0;

  const components: number[] = [Math.min(1, performed.length / plannedSets)];

  const repsFloor = plannedRepsFloor(planned.reps);
  if (repsFloor != null) {
    const hit = performed.filter((s) => s.reps != null && s.reps >= repsFloor).length;
    components.push(Math.min(1, hit / plannedSets));
  }

  if (planned.load_kg != null && planned.load_kg > 0) {
    const target = planned.load_kg;
    const hit = performed.filter((s) => s.weight != null && s.weight >= target).length;
    components.push(Math.min(1, hit / plannedSets));
  }

  return components.reduce((a, b) => a + b, 0) / components.length;
}

/**
 * Skóre jedného odcvičeného tréningu (0–1) oproti plánu dňa. `null` = deň nemá
 * plánované cviky (nedá sa porovnať). Zdieľané s lib/dashboard/analytics.ts
 * (agregovaný prehľad naprieč klientmi) — rovnaká metrika na oboch miestach.
 */
export function sessionCompletionScore(plannedRaw: unknown, entriesRaw: unknown): number | null {
  const planned = Array.isArray(plannedRaw) ? (plannedRaw as PlannedExercise[]) : [];
  if (planned.length === 0) return null;

  const entries = Array.isArray(entriesRaw) ? (entriesRaw as Record<string, unknown>[]) : [];
  const byId = new Map<string, PerformedSet[]>();
  const byName = new Map<string, PerformedSet[]>();
  for (const e of entries) {
    const sets = Array.isArray(e.sets) ? (e.sets as PerformedSet[]) : [];
    const entryId = (e.entryId as string) ?? (e.entry_id as string) ?? null;
    const name = (e.name as string) ?? (e.exercise_name as string) ?? null;
    if (entryId) byId.set(entryId, sets);
    if (name) byName.set(normName(name), sets);
  }

  let sum = 0;
  for (const p of planned) {
    const performed =
      (p.entry_id ? byId.get(p.entry_id) : undefined) ?? byName.get(normName(p.exercise_name)) ?? null;
    sum += plannedExerciseScore(p, performed);
  }
  return sum / planned.length;
}

/**
 * Adherencia tréningu — % dní za posledných 30/90 dní, kde má klient aspoň
 * jeden odcvičený tréning (naprieč všetkými plánmi). Bez cieľa/rozvrhu (rotačný
 * model — klient si sám volí kedy cvičí, viď lib/portal/data.ts), takže "v
 * poriadku" tu jednoducho znamená "v ten deň niečo odcvičil". Plus doplnková
 * metrika `planCompletion` (feature/analytika-v2) — nakoľko sa to, čo klient
 * odcvičil, zhoduje s predpisom z plánu.
 */
export async function getTrainingAdherence(clientId: string): Promise<TrainingAdherence | null> {
  const supabase = await createClient();
  const { isoDate, base } = todayInTz();
  const historyStart = iso(addDays(base, -(WINDOW_90_DAYS - 1)));

  const { data, error } = await supabase
    .from("workout_logs")
    .select("performed_on, workout_day_id, entries, workout_days(exercises)")
    .eq("client_id", clientId)
    .gte("performed_on", historyStart)
    .lte("performed_on", isoDate);
  if (error) return null;

  const rows = data ?? [];
  const trainedDates = new Set(rows.map((r) => r.performed_on as string));

  const windowFor = (days: number) => {
    let trained = 0;
    for (let i = 0; i < days; i++) {
      if (trainedDates.has(iso(addDays(base, -i)))) trained++;
    }
    return { pct: Math.round((trained / days) * 100), trainedDays: trained, totalDays: days };
  };

  // Plan completion: skóre za každý odcvičený tréning, ktorý má naviazaný deň s cvikmi.
  const scored: { date: string; score: number }[] = [];
  for (const r of rows) {
    const day = (r.workout_days as unknown as { exercises: unknown } | null) ?? null;
    if (!day) continue;
    const score = sessionCompletionScore(day.exercises, r.entries);
    if (score != null) scored.push({ date: r.performed_on as string, score });
  }

  const planWindowFor = (days: number): PlanCompletionWindow => {
    const cutoff = iso(addDays(base, -(days - 1)));
    const inWindow = scored.filter((s) => s.date >= cutoff);
    if (inWindow.length === 0) return { pct: null, sessionsScored: 0 };
    const avg = inWindow.reduce((a, b) => a + b.score, 0) / inWindow.length;
    return { pct: Math.round(avg * 100), sessionsScored: inWindow.length };
  };

  return {
    window30: windowFor(30),
    window90: windowFor(90),
    planCompletion: { window30: planWindowFor(30), window90: planWindowFor(90) },
  };
}
