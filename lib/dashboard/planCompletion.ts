// Jediný zdroj pravdy pre "odcvičenosť" tréningových plánov na strane trénera.
// Deň plánu je hotový, ak preň existuje aspoň jeden `workout_logs` riadok —
// rovnaká definícia ako badge "Hotovo" v klientskom portáli (lib/portal/data.ts,
// getPortalTraining → `doneIds`). Obe trénerove obrazovky (zoznam Tréningy aj
// detail klienta → Tréningy) čítajú stav odtiaľto, aby nemohol byť na jednom
// mieste iný než na druhom.

import type { createClient } from "@/lib/supabase/server";

export interface PlanCompletion {
  totalDays: number;
  /** Dni plánu s aspoň jedným záznamom v `workout_logs` (kedykoľvek v histórii). */
  completedDays: number;
  /** Plán má aspoň jeden deň a klient odcvičil všetky — badge "Hotovo". */
  allDone: boolean;
}

const EMPTY: PlanCompletion = { totalDays: 0, completedDays: 0, allDone: false };

/**
 * Odcvičenosť plánov z ich dní. Volajúci už `workout_days.id` má (obe stránky si
 * ich ťahajú v embed dopyte namiesto `workout_days(count)`), takže tu stačí
 * jediný dopyt na `workout_logs`. RLS `workout_logs_select_own_trainer` (0003)
 * scopuje riadky na klientov prihláseného trénera.
 */
export async function getPlanCompletion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  plans: { id: string; dayIds: string[] }[],
): Promise<Map<string, PlanCompletion>> {
  const result = new Map<string, PlanCompletion>();
  const allDayIds = plans.flatMap((p) => p.dayIds);

  if (allDayIds.length === 0) {
    for (const p of plans) result.set(p.id, EMPTY);
    return result;
  }

  const { data: logs } = await supabase
    .from("workout_logs")
    .select("workout_day_id")
    .in("workout_day_id", allDayIds);
  const completed = new Set((logs ?? []).map((l) => l.workout_day_id as string));

  for (const p of plans) {
    const completedDays = p.dayIds.filter((id) => completed.has(id)).length;
    result.set(p.id, {
      totalDays: p.dayIds.length,
      completedDays,
      allDone: p.dayIds.length > 0 && completedDays === p.dayIds.length,
    });
  }
  return result;
}
