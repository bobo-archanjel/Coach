// Odcvičené dni plánu na strane trénera — posledný dokončený zápis každého dňa ako
// plán vs. skutočnosť. Zdieľané detailom plánu (builder: zamknuté dni) aj náhľadom
// plánu (/dashboard/treningy/[planId]/nahlad: karty cvikov pri odcvičených dňoch).

import type { createClient } from "@/lib/supabase/server";
import { compareLog, type CompletedCompare } from "@/lib/workouts/completed";

/** Odcvičený deň (posledný záznam klienta) — v builderi zamknutý, ukáže plán vs. skutočnosť. */
export interface DoneDay {
  logId: string;
  completedAt: string;
  compare: CompletedCompare;
  /** celková náročnosť a poznámka klienta k tréningu (workout_logs.rpe / note) */
  rpe: number | null;
  note: string | null;
  /** klient hodnoty dodatočne opravil (24 h okno, 0049) */
  editedAt: string | null;
}

/**
 * Dokončené tréningy z tohto plánu (snapshot 0048), od najnovšieho. Plán má max. 14 dní,
 * každý sa odcvičí raz — limit 50 stačí aj s opakovaniami.
 */
export function fetchPlanLogs(supabase: Awaited<ReturnType<typeof createClient>>, planId: string) {
  return supabase
    .from("workout_logs")
    .select("id, workout_day_id, completed_at, performed_on, plan_snapshot, entries, rpe, note, edited_at")
    .eq("plan_snapshot->>plan_id", planId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(50);
}

type PlanLogRow = {
  id: unknown;
  workout_day_id: unknown;
  completed_at: unknown;
  performed_on: unknown;
  plan_snapshot: unknown;
  entries: unknown;
  rpe: unknown;
  note: unknown;
  edited_at: unknown;
};

/**
 * Posledný záznam každého dňa (logy sú od najnovšieho). Tréning zo zmazaného dňa
 * (workout_day_id null) sa tu neukáže — záznam ostáva v DB, napr. pre analytiku.
 */
export function buildDoneDays(logs: PlanLogRow[]): Record<string, DoneDay> {
  const doneDays: Record<string, DoneDay> = {};
  for (const log of logs) {
    const dayId = log.workout_day_id as string | null;
    if (!dayId || doneDays[dayId]) continue;
    doneDays[dayId] = {
      logId: log.id as string,
      completedAt: (log.completed_at as string | null) ?? `${log.performed_on as string}T12:00:00Z`,
      compare: compareLog(log.plan_snapshot, log.entries),
      rpe: (log.rpe as number | null) ?? null,
      note: (log.note as string | null) ?? null,
      editedAt: (log.edited_at as string | null) ?? null,
    };
  }
  return doneDays;
}

type ExerciseEntryLike = { entry_id?: string | null; exercise_name: string; load_kg?: number | null };

/** Dni plánu pre okno „Zopakovať s progresiou“ (ProgressionDialog). */
export const toProgressionDays = (days: { id: string; name: string; exercises: unknown }[]) =>
  days.map((d) => ({
    id: d.id,
    name: d.name,
    exercises: ((Array.isArray(d.exercises) ? d.exercises : []) as ExerciseEntryLike[]).map((e) => ({
      entryId: e.entry_id ?? null,
      name: e.exercise_name,
      loadKg: e.load_kg ?? null,
    })),
  }));
