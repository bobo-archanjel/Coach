import { createClient } from "@/lib/supabase/server";

// Progres a analýza (feature/progress-analyst) — body_metrics (0023) + odvodené
// grafy sily/objemu z existujúcich workout_logs.entries (jsonb, rovnaký tvar ako
// LoggedExercise v lib/portal/types.ts: [{entryId, name, sets:[{reps, weight}]}]).
// Zatiaľ len trénerská strana (`/dashboard/klienti/[id]`, `/dashboard/analytika`).

export interface BodyMetricEntry {
  measuredOn: string; // YYYY-MM-DD
  weightKg: number | null;
  waistCm: number | null;
  chestCm: number | null;
  hipsCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  note: string | null;
}

type BodyMetricRow = {
  measured_on: string;
  weight_kg: number | null;
  waist_cm: number | null;
  chest_cm: number | null;
  hips_cm: number | null;
  arm_cm: number | null;
  thigh_cm: number | null;
  note: string | null;
};

function toEntry(r: BodyMetricRow): BodyMetricEntry {
  return {
    measuredOn: r.measured_on,
    weightKg: r.weight_kg,
    waistCm: r.waist_cm,
    chestCm: r.chest_cm,
    hipsCm: r.hips_cm,
    armCm: r.arm_cm,
    thighCm: r.thigh_cm,
    note: r.note,
  };
}

/** História meraní klienta, najstaršie prvé (pre graf váhy). `null` len pri chybe. */
export async function getBodyMetrics(clientId: string): Promise<BodyMetricEntry[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("body_metrics")
    .select("measured_on, weight_kg, waist_cm, chest_cm, hips_cm, arm_cm, thigh_cm, note")
    .eq("client_id", clientId)
    .order("measured_on", { ascending: true });
  if (error) return null;
  return (data ?? []).map(toEntry);
}

/** Najnovšie meranie (pre delta na `/dashboard/analytika`), alebo null ak žiadne. */
export async function getLatestBodyMetric(clientId: string): Promise<BodyMetricEntry | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("body_metrics")
    .select("measured_on, weight_kg, waist_cm, chest_cm, hips_cm, arm_cm, thigh_cm, note")
    .eq("client_id", clientId)
    .order("measured_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toEntry(data as BodyMetricRow) : null;
}

type LoggedSet = { reps: number | null; weight: number | null };
type LoggedExerciseEntry = { entryId?: string | null; name?: string; sets?: LoggedSet[] };

function parseEntries(raw: unknown): LoggedExerciseEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw as LoggedExerciseEntry[];
}

export interface StrengthPoint {
  date: string; // performed_on
  bestWeightKg: number;
  reps: number;
}

/** Nové osobné maximum na cviku (feature/analytika-v2, bod 3) — odvodené, nič sa neukladá. */
export interface StrengthPR {
  exercise: string;
  bestWeightKg: number;
  reps: number;
  /** performed_on tréningu, kde padlo maximum */
  achievedOn: string;
}

type StrengthLogRow = { performed_on: string; entries: unknown; client_id?: string; workout_days?: unknown };
type PlanEntry = { entry_id?: string | null; exercise_id?: string | null };

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

/** Stĺpce workout_logs potrebné pre graf sily — `workout_days(exercises)` kvôli entryId → exercise_id. */
const STRENGTH_LOG_COLUMNS = "performed_on, entries, workout_days(exercises)";

/**
 * Zjednotený názov cviku pre graf sily a PR. Záznam tréningu si pamätá názov z
 * času zápisu — staré záznamy majú anglický ("Barbell Bench Press - Medium Grip"),
 * nové slovenský ("Bench press s činkou"), takže zoskupenie podľa uloženého
 * názvu rozdelilo jeden cvik na dve krivky (QA 2026-09-23). Preto:
 * entryId → riadok plánu → exercise_id → aktuálny názov z knižnice (name_sk ||
 * name). Keď sa riadok plánu medzičasom zmazal, skúsi sa zhoda uloženého názvu
 * s anglickým/slovenským názvom cvikov z plánov tohto klienta; inak ostáva
 * uložený názov (vlastné cviky bez exercise_id).
 */
async function buildExerciseNameResolver(
  supabase: SupabaseServer,
  rows: StrengthLogRow[],
): Promise<(row: StrengthLogRow, entry: LoggedExerciseEntry) => string | null> {
  const exerciseIdByEntry = new Map<string, string>();
  for (const row of rows) {
    const day = row.workout_days as { exercises?: unknown } | null | undefined;
    for (const e of (Array.isArray(day?.exercises) ? day!.exercises : []) as PlanEntry[]) {
      if (e.entry_id && e.exercise_id) exerciseIdByEntry.set(e.entry_id, e.exercise_id);
    }
  }

  const displayById = new Map<string, string>();
  const displayByStoredName = new Map<string, string>();
  const ids = [...new Set(exerciseIdByEntry.values())];
  if (ids.length > 0) {
    const { data } = await supabase.from("exercises").select("id, name, name_sk").in("id", ids);
    for (const ex of data ?? []) {
      const display = (ex.name_sk as string | null)?.trim() || (ex.name as string);
      displayById.set(ex.id as string, display);
      displayByStoredName.set((ex.name as string).trim().toLowerCase(), display);
      if (ex.name_sk) displayByStoredName.set((ex.name_sk as string).trim().toLowerCase(), display);
    }
  }

  return (_row, entry) => {
    const id = entry.entryId ? exerciseIdByEntry.get(entry.entryId) : undefined;
    const byId = id ? displayById.get(id) : undefined;
    if (byId) return byId;
    const stored = entry.name?.trim();
    if (!stored) return null;
    return displayByStoredName.get(stored.toLowerCase()) ?? stored;
  };
}

/** Zoskupí workout_logs riadky na časový rad najťažších sérií per cvik (zjednotený názov). */
function strengthSeriesFromRows(
  rows: StrengthLogRow[],
  nameOf: (row: StrengthLogRow, entry: LoggedExerciseEntry) => string | null,
): Record<string, StrengthPoint[]> {
  const byExercise: Record<string, StrengthPoint[]> = {};
  for (const row of rows) {
    // Jeden tréning môže obsahovať ten istý cvik 2× (duplicitné riadky knižnice
    // zlúčené pod jeden názov) — v grafe má byť za deň jeden bod s najťažšou sériou.
    const bestInRow = new Map<string, StrengthPoint>();
    for (const ex of parseEntries(row.entries)) {
      const name = nameOf(row, ex);
      if (!name) continue;
      let best: LoggedSet | null = null;
      for (const s of ex.sets ?? []) {
        if (s.weight == null) continue;
        if (!best || s.weight > (best.weight ?? -Infinity) || (s.weight === best.weight && (s.reps ?? 0) > (best.reps ?? 0))) {
          best = s;
        }
      }
      if (best?.weight != null) {
        const prev = bestInRow.get(name);
        if (!prev || best.weight > prev.bestWeightKg || (best.weight === prev.bestWeightKg && (best.reps ?? 0) > prev.reps)) {
          bestInRow.set(name, { date: row.performed_on, bestWeightKg: best.weight, reps: best.reps ?? 0 });
        }
      }
    }
    for (const [name, point] of bestInRow) (byExercise[name] ??= []).push(point);
  }
  return byExercise;
}

/**
 * Cvik je "nové osobné maximum", keď POSLEDNÝ zaznamenaný tréning s ním prekonal
 * najťažšiu sériu zo všetkých predošlých (striktne — vyrovnanie maxima nie je
 * "nové"). Vyžaduje aspoň 2 záznamy — jeden bod nie je z čoho prekonať.
 * Predpokladá `points` zoradené vzostupne podľa dátumu.
 */
function latestIsNewPR(points: StrengthPoint[]): boolean {
  if (points.length < 2) return false;
  const last = points[points.length - 1];
  const prevMax = Math.max(...points.slice(0, -1).map((p) => p.bestWeightKg));
  return last.bestWeightKg > prevMax;
}

/**
 * Progres sily pre všetky cviky naraz — jeden dotaz na workout_logs, zoskupené
 * podľa zjednoteného názvu cviku z knižnice (viď buildExerciseNameResolver). Pre každý tréning, kde bol cvik zapísaný,
 * najťažšia séria (podľa váhy; pri zhode vyššie opakovania). Cviky bez zadanej
 * váhy (vlastná váha) sa do grafu nedostanú — nie je čo vyniesť na os.
 * Vracia zoznam názvov (abecedne, pre výber v UI) + mapu názov → body grafu +
 * zoznam cvikov, na ktorých je posledný záznam nové osobné maximum (bod 3).
 */
export async function getAllStrengthProgress(
  clientId: string,
): Promise<{ names: string[]; byExercise: Record<string, StrengthPoint[]>; prs: StrengthPR[] } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workout_logs")
    .select(STRENGTH_LOG_COLUMNS)
    .eq("client_id", clientId)
    .order("performed_on", { ascending: true });
  if (error) return null;

  const rows = (data ?? []) as StrengthLogRow[];
  const byExercise = strengthSeriesFromRows(rows, await buildExerciseNameResolver(supabase, rows));
  const names = Object.keys(byExercise).sort((a, b) => a.localeCompare(b, "sk"));

  const prs: StrengthPR[] = [];
  for (const name of names) {
    const points = byExercise[name];
    if (!latestIsNewPR(points)) continue;
    const last = points[points.length - 1];
    prs.push({ exercise: name, bestWeightKg: last.bestWeightKg, reps: last.reps, achievedOn: last.date });
  }
  prs.sort((a, b) => b.achievedOn.localeCompare(a.achievedOn));

  return { names, byExercise, prs };
}

/**
 * Nedávne osobné maximá naprieč viacerými klientmi (feature/analytika-v2, bod 3) —
 * pre widget "Posledné PR" na `/dashboard/analytika`. Jeden dotaz na workout_logs
 * pre všetkých klientov naraz (nie N+1). Celá história sa načíta (na určenie
 * all-time maxima), vráti sa len PR, ktoré padlo za posledných `sinceDays` dní.
 * `null` len pri chybe načítania.
 */
export async function getRecentPRs(
  clientIds: string[],
  sinceDays = 14,
): Promise<Map<string, StrengthPR[]> | null> {
  if (clientIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workout_logs")
    .select(`client_id, ${STRENGTH_LOG_COLUMNS}`)
    .in("client_id", clientIds)
    .order("performed_on", { ascending: true });
  if (error) return null;
  const nameOf = await buildExerciseNameResolver(supabase, (data ?? []) as StrengthLogRow[]);

  const rowsByClient = new Map<string, StrengthLogRow[]>();
  for (const row of (data ?? []) as StrengthLogRow[]) {
    const cid = row.client_id as string;
    const list = rowsByClient.get(cid) ?? [];
    list.push(row);
    rowsByClient.set(cid, list);
  }

  const cutoff = new Date(Date.now() - sinceDays * 86_400_000).toISOString().slice(0, 10);
  const result = new Map<string, StrengthPR[]>();
  for (const [clientId, rows] of rowsByClient) {
    const byExercise = strengthSeriesFromRows(rows, nameOf);
    const prs: StrengthPR[] = [];
    for (const [name, points] of Object.entries(byExercise)) {
      if (!latestIsNewPR(points)) continue;
      const last = points[points.length - 1];
      if (last.date < cutoff) continue;
      prs.push({ exercise: name, bestWeightKg: last.bestWeightKg, reps: last.reps, achievedOn: last.date });
    }
    if (prs.length > 0) {
      prs.sort((a, b) => b.achievedOn.localeCompare(a.achievedOn));
      result.set(clientId, prs);
    }
  }
  return result;
}
