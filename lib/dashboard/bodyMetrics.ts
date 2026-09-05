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

/**
 * Progres sily pre všetky cviky naraz — jeden dotaz na workout_logs, zoskupené
 * podľa názvu cviku (entryId je viazaný na konkrétny riadok v pláne a nemusí
 * prežiť úpravu plánu, názov áno). Pre každý tréning, kde bol cvik zapísaný,
 * najťažšia séria (podľa váhy; pri zhode vyššie opakovania). Cviky bez zadanej
 * váhy (vlastná váha) sa do grafu nedostanú — nie je čo vyniesť na os.
 * Vracia zoznam názvov (abecedne, pre výber v UI) + mapu názov → body grafu.
 */
export async function getAllStrengthProgress(
  clientId: string,
): Promise<{ names: string[]; byExercise: Record<string, StrengthPoint[]> } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workout_logs")
    .select("performed_on, entries")
    .eq("client_id", clientId)
    .order("performed_on", { ascending: true });
  if (error) return null;

  const byExercise: Record<string, StrengthPoint[]> = {};
  for (const row of data ?? []) {
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
          date: row.performed_on as string,
          bestWeightKg: best.weight,
          reps: best.reps ?? 0,
        });
      }
    }
  }

  const names = Object.keys(byExercise).sort((a, b) => a.localeCompare(b, "sk"));
  return { names, byExercise };
}
