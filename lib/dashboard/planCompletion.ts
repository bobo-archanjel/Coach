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

/** Hláška pre úpravy plánu, ktorý klient celý odcvičil (badge "Hotovo"). */
export const PLAN_LOCKED_ERROR = "Klient tento plán celý odcvičil — plán je uzamknutý a nedá sa upravovať.";

type DayLogCount = { id: string; workout_logs: { count: number }[] | null };

/** Rovnaká definícia ako getPlanCompletion: každý deň plánu má aspoň jeden záznam. */
function allDaysDone(days: DayLogCount[] | null | undefined): boolean {
  const list = days ?? [];
  return list.length > 0 && list.every((d) => (d.workout_logs?.[0]?.count ?? 0) > 0);
}

/**
 * Plán je uzamknutý, keď ho klient celý odcvičil (rovnaká definícia ako badge
 * "Hotovo", getPlanCompletion). Builder vtedy úpravy neponúka a serverové akcie
 * ich touto kontrolou odmietnu. S `dayId` sa plán berie z dňa (nie z `planId`
 * z formulára), aby sa kontrola nedala obísť nesúhlasným párom ID.
 * Jeden dopyt (dni plánu + počet logov embedom) — predtým 2-3 round-tripy za
 * sebou pred KAŽDOU úpravou v builderi.
 */
export async function isPlanLocked(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planId: string,
  dayId?: string | null,
): Promise<boolean> {
  if (dayId) return (await getDayForEdit(supabase, dayId)).locked;
  const { data } = await supabase
    .from("workout_plans")
    .select("workout_days(id, workout_logs(count))")
    .eq("id", planId)
    .maybeSingle();
  return allDaysDone(data?.workout_days as DayLogCount[] | undefined);
}

/**
 * Deň plánu na úpravu (jeho `exercises`) + či je plán uzamknutý — jedným dopytom.
 * Akcie buildera predtým robili isPlanLocked (3 dopyty) a potom ešte načítanie dňa,
 * všetko za sebou. Zámok sa počíta z plánu, ku ktorému deň naozaj patrí.
 * `day: null` = deň neexistuje / nie je trénerov (RLS).
 */
export async function getDayForEdit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dayId: string,
): Promise<{ day: { plan_id: string; exercises: unknown } | null; locked: boolean }> {
  const { data } = await supabase
    .from("workout_days")
    .select("plan_id, exercises, workout_plans(workout_days(id, workout_logs(count)))")
    .eq("id", dayId)
    .maybeSingle();
  if (!data) return { day: null, locked: false };
  const plan = data.workout_plans as unknown as { workout_days: DayLogCount[] | null } | null;
  return {
    day: { plan_id: data.plan_id as string, exercises: data.exercises },
    locked: allDaysDone(plan?.workout_days),
  };
}
