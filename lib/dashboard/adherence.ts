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

/** % dní s aspoň jedným odcvičeným tréningom v okne — bez cieľa, klient si sám volí kedy cvičí (rotačný model). */
export interface TrainingAdherence {
  window30: { pct: number; trainedDays: number; totalDays: number };
  window90: { pct: number; trainedDays: number; totalDays: number };
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

/**
 * Adherencia tréningu — % dní za posledných 30/90 dní, kde má klient aspoň
 * jeden odcvičený tréning (naprieč všetkými plánmi). Bez cieľa/rozvrhu (rotačný
 * model — klient si sám volí kedy cvičí, viď lib/portal/data.ts), takže "v
 * poriadku" tu jednoducho znamená "v ten deň niečo odcvičil".
 */
export async function getTrainingAdherence(clientId: string): Promise<TrainingAdherence | null> {
  const supabase = await createClient();
  const { isoDate, base } = todayInTz();
  const historyStart = iso(addDays(base, -(WINDOW_90_DAYS - 1)));

  const { data, error } = await supabase
    .from("workout_logs")
    .select("performed_on")
    .eq("client_id", clientId)
    .gte("performed_on", historyStart)
    .lte("performed_on", isoDate);
  if (error) return null;

  const trainedDates = new Set((data ?? []).map((r) => r.performed_on as string));

  const windowFor = (days: number) => {
    let trained = 0;
    for (let i = 0; i < days; i++) {
      if (trainedDates.has(iso(addDays(base, -i)))) trained++;
    }
    return { pct: Math.round((trained / days) * 100), trainedDays: trained, totalDays: days };
  };

  return { window30: windowFor(30), window90: windowFor(90) };
}
