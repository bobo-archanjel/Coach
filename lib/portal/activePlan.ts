/**
 * Ktorý tréningový plán riadi kartu Dnes: `clients.active_plan_id`, ak ukazuje na
 * zverejnený plán klienta, inak najnovší zverejnený (spätne kompatibilné — kým klient
 * ani tréner nič nezvolili). Nový plán zvolený aktívny neprebije: pri zverejnení ho
 * pripne trigger `workout_plans_pin_active` (0056), len keď platný aktívny chýba.
 *
 * Zdieľané portálom (Dnes aj Tréning, lib/portal/data.ts) a detailom klienta u trénera.
 * `publishedNewestFirst` = zverejnené plány klienta zoradené od najnovšieho (created_at desc).
 */
export function resolveActivePlanId(
  activePlanId: string | null | undefined,
  publishedNewestFirst: readonly { id: string }[],
): string | null {
  if (activePlanId && publishedNewestFirst.some((p) => p.id === activePlanId)) return activePlanId;
  return publishedNewestFirst[0]?.id ?? null;
}

/**
 * Aktívny jedálniček z pohľadu trénera (0067). Tréner vidí len svoje jedálničky — keď si
 * klient zvolil vlastný (trainer_id null, trénerovi skrytý), žiadny z trénerových nie je
 * aktívny (null), namiesto mylného „najnovší“. Bez voľby platí najnovší zverejnený.
 */
export function resolveTrainerActiveMealPlanId(
  activeMealPlanId: string | null | undefined,
  trainerPublishedNewestFirst: readonly { id: string }[],
): string | null {
  if (!activeMealPlanId) return trainerPublishedNewestFirst[0]?.id ?? null;
  return trainerPublishedNewestFirst.some((p) => p.id === activeMealPlanId) ? activeMealPlanId : null;
}
