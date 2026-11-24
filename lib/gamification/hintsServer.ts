import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysIso } from "@/lib/reports/period";
import { buildExerciseHistories, type ExerciseHistory } from "./progression";
import { exerciseKeyOf } from "./records";

// FitPilot — nápoveda z histórie pre cviky dnešného tréningu (gamifikácia v2). Jeden dopyt na
// posledné tréningy klienta + jeden na uložené rekordy cvikov dňa; výsledok je malá mapa kľúč cviku → história,
// ktorú klientsky formulár porovnáva sám (bez ďalších požiadaviek počas tréningu).
// Čítanie cez bežný klient (RLS: len vlastné riadky). Chyba / chýbajúce dáta = žiadne nápovedy.

type Sb = SupabaseClient;

/** Koľko posledných tréningov sa prehľadá (≈ 3–6 mesiacov) a ako ďaleko do minulosti. */
const HISTORY_LOGS = 60;
const HISTORY_DAYS = 240;

export async function loadWorkoutHints(supabase: Sb, clientId: string, exerciseNames: string[], today: string): Promise<Record<string, ExerciseHistory>> {
  try {
    const keys = new Set(exerciseNames.map((n) => exerciseKeyOf(n)).filter(Boolean));
    if (keys.size === 0) return {};
    const [logsRes, prRes] = await Promise.all([
      supabase
        .from("workout_logs")
        .select("performed_on, entries")
        .eq("client_id", clientId)
        .eq("status", "completed")
        .gte("performed_on", addDaysIso(today, -HISTORY_DAYS))
        .order("performed_on", { ascending: false })
        .limit(HISTORY_LOGS),
      supabase
        .from("client_achievements")
        .select("exercise_key, value, e1rm")
        .eq("client_id", clientId)
        .eq("kind", "pr")
        .in("exercise_key", [...keys])
        .limit(500),
    ]);
    if (logsRes.error) return {};
    const extra = new Map<string, { weight: number; e1rm: number | null }>();
    for (const r of (prRes.error ? [] : prRes.data ?? []) as { exercise_key: string; value: number | string | null; e1rm: number | string | null }[]) {
      const cur = extra.get(r.exercise_key);
      const w = r.value != null ? Number(r.value) : 0;
      const e = r.e1rm != null ? Number(r.e1rm) : null;
      extra.set(r.exercise_key, {
        weight: Math.max(cur?.weight ?? 0, w),
        e1rm: e == null ? (cur?.e1rm ?? null) : Math.max(cur?.e1rm ?? 0, e),
      });
    }
    return buildExerciseHistories(
      ((logsRes.data ?? []) as { performed_on: string; entries: unknown }[]).map((l) => ({ performedOn: l.performed_on, entries: l.entries })),
      keys,
      extra,
    );
  } catch {
    return {};
  }
}
