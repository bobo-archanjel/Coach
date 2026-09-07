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

type StrengthLogRow = { performed_on: string; entries: unknown; client_id?: string };

/** Zoskupí workout_logs riadky na časový rad najťažších sérií per cvik (názov). */
function strengthSeriesFromRows(rows: StrengthLogRow[]): Record<string, StrengthPoint[]> {
  const byExercise: Record<string, StrengthPoint[]> = {};
  for (const row of rows) {
    for (const ex of parseEntries(row.entries)) {
      if (!ex.name) continue;
      let best: LoggedSet | null = null;
      for (const s of ex.sets ?? []) {
        if (s.weight == null) continue;
        if (!best || s.weight > (best.weight ?? -Infinity) || (s.weight === best.weight && (s.reps ?? 0) > (best.reps ?? 0))) {
          best = s;
        }
      }
      if (best?.weight != null) {
        (byExercise[ex.name] ??= []).push({
          date: row.performed_on,
          bestWeightKg: best.weight,
          reps: best.reps ?? 0,
        });
      }
    }
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
 * podľa názvu cviku (entryId je viazaný na konkrétny riadok v pláne a nemusí
 * prežiť úpravu plánu, názov áno). Pre každý tréning, kde bol cvik zapísaný,
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
    .select("performed_on, entries")
    .eq("client_id", clientId)
    .order("performed_on", { ascending: true });
  if (error) return null;

  const byExercise = strengthSeriesFromRows((data ?? []) as StrengthLogRow[]);
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
    .select("client_id, performed_on, entries")
    .in("client_id", clientIds)
    .order("performed_on", { ascending: true });
  if (error) return null;

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
    const byExercise = strengthSeriesFromRows(rows);
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
