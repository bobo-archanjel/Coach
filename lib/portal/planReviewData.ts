import { createClient } from "@/lib/supabase/server";
import { buildExerciseNameResolver, type StrengthLogRow } from "@/lib/dashboard/bodyMetrics";
import { buildPlanReview, type PlanReview } from "./planReview";

// Načítanie pre vyhodnotenie plánu (lib/portal/planReview.ts) — RLS klienta: plán aj
// zápisy vidí len svoje. Zápisy celej histórie klienta, aby rekordy a grafy cvikov
// porovnali plán s obdobím pred ním (aj z iných plánov).

type LogRow = {
  id: string;
  workout_day_id: string | null;
  performed_on: string;
  completed_at: string | null;
  rpe: number | null;
  note: string | null;
  entries: unknown;
  plan_snapshot: unknown;
  workout_days: unknown;
};

/** `null` = plán neexistuje / nepatrí prihlásenému, alebo chyba načítania. */
export async function getPlanReview(planId: string): Promise<PlanReview | null> {
  const supabase = await createClient();
  const { data: plan, error: planErr } = await supabase
    .from("workout_plans")
    .select("client_id, workout_days(id, name, day_number, exercises)")
    .eq("id", planId)
    .order("day_number", { referencedTable: "workout_days", ascending: true })
    .maybeSingle();
  if (planErr || !plan) return null;

  const { data, error } = await supabase
    .from("workout_logs")
    .select("id, workout_day_id, performed_on, completed_at, rpe, note, entries, plan_snapshot, workout_days(exercises)")
    .eq("client_id", plan.client_id as string)
    .order("performed_on", { ascending: true });
  if (error) return null;

  const rows = (data ?? []) as LogRow[];
  const days = (plan.workout_days ?? []) as { id: string; name: string; exercises: unknown }[];
  // dni plánu ako „riadky“ navyše — resolver z nich pozná entry_id → exercise_id
  // aj pri cviku, ktorý sa v zápisoch volá inak (starší anglický názov)
  const resolverRows: StrengthLogRow[] = [
    ...rows.map((r) => ({ performed_on: r.performed_on, entries: r.entries, workout_days: r.workout_days })),
    ...days.map((d) => ({ performed_on: "", entries: [], workout_days: { exercises: d.exercises } })),
  ];
  const resolve = await buildExerciseNameResolver(supabase, resolverRows);
  const nameOf = (entryId: string | null, storedName: string) =>
    resolve({ performed_on: "", entries: [] }, { entryId, name: storedName }) ?? storedName;

  return buildPlanReview({
    days,
    logs: rows.map((r) => ({
      id: r.id,
      dayId: r.workout_day_id,
      performedOn: r.performed_on,
      completedAt: r.completed_at,
      rpe: r.rpe,
      note: r.note,
      entries: r.entries,
      planSnapshot: r.plan_snapshot,
    })),
    nameOf,
  });
}
