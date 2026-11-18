/* DEV náhľady: plán vs. skutočnosť (CompletedExercises) z cvikov náhľadu — tvar
   workout_logs.plan_snapshot (0048) poskladaný z PortalExercise. */
import type { PortalExercise } from "@/lib/portal/types";
import { compareLog, type CompletedCompare } from "@/lib/workouts/completed";

export function previewCompare(plan: PortalExercise[] | null, entries: unknown[]): CompletedCompare {
  const snapshot = plan && {
    exercises: plan.map((e) => ({
      entry_id: e.entryId,
      exercise_id: e.exerciseId,
      exercise_name: e.name,
      sets: e.plannedSets,
      reps: e.plannedReps,
      load_kg: e.loadKg,
      tempo: null,
      rest_seconds: e.restSeconds,
    })),
  };
  return compareLog(snapshot, entries);
}
