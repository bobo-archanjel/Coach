import type { SupabaseClient } from "@supabase/supabase-js";

// "Mešká" = má priradený plán, ale posledný odklikaný tréning (alebo pridelenie
// plánu, ak ešte necvičil vôbec) je viac ako LATE_THRESHOLD_DAYS dozadu. Zdieľané
// medzi badge "meškanie" na /dashboard (app/dashboard/page.tsx) a proaktívnym AI
// check-in pg_cron jobom (supabase/migrations/0033 — SQL má vlastnú, ale zámerne
// zhodnú kópiu tejto definície, keďže cron beží v Postgrese, nie v tomto kóde;
// pri zmene threshold/referencie uprav OBOJE).
export const LATE_THRESHOLD_DAYS = 5;

export interface LateStatus {
  days: number;
  tone: "active" | "late";
  /**
   * Dátum (YYYY-MM-DD), od ktorého sa meškanie počíta — posledný tréning, alebo
   * pridelenie plánu, ak ešte necvičil. Súčasť kľúča skrytia upozornenia
   * (lib/dashboard/attention.ts): po novom tréningu sa zmení, takže ďalšie
   * meškanie už nie je "to isté" skryté upozornenie.
   */
  since: string;
}

/** Per-klient stav meškania — len pre klientov, ktorí majú aspoň jeden priradený plán. */
export async function getLateStatusByClient(
  supabase: SupabaseClient,
  clientIds: string[],
): Promise<Map<string, LateStatus>> {
  const statusByClient = new Map<string, LateStatus>();
  if (clientIds.length === 0) return statusByClient;

  // Len NAJNOVŠÍ plán a NAJNOVŠÍ tréning na klienta (embed s limitom na rodiča) —
  // predtým sa ťahala celá história plánov aj logov všetkých klientov, len aby sa
  // z nej vzal prvý riadok. Rástlo to s každým tréningom (a PostgREST strop 1000
  // riadkov by časom odrezal starších klientov → zlý počet dní meškania).
  // Explicitná FK pri workout_plans: clients má aj active_plan_id → workout_plans.
  const { data: rows } = await supabase
    .from("clients")
    .select("id, workout_logs(performed_on), workout_plans!workout_plans_client_id_fkey(created_at)")
    .in("id", clientIds)
    .order("performed_on", { referencedTable: "workout_logs", ascending: false })
    .limit(1, { referencedTable: "workout_logs" })
    .order("created_at", { referencedTable: "workout_plans", ascending: false })
    .limit(1, { referencedTable: "workout_plans" });

  const latestPlanByClient = new Map<string, string>();
  const latestLogByClient = new Map<string, string>();
  for (const r of rows ?? []) {
    const plan = (r.workout_plans as { created_at: string }[] | null)?.[0];
    const log = (r.workout_logs as { performed_on: string }[] | null)?.[0];
    if (plan) latestPlanByClient.set(r.id as string, plan.created_at);
    if (log) latestLogByClient.set(r.id as string, log.performed_on);
  }

  const todayMs = Date.now();
  for (const [clientId, planCreatedAt] of latestPlanByClient) {
    const reference = latestLogByClient.get(clientId) ?? planCreatedAt;
    const days = Math.floor((todayMs - new Date(reference).getTime()) / 86_400_000);
    statusByClient.set(clientId, {
      days,
      tone: days >= LATE_THRESHOLD_DAYS ? "late" : "active",
      since: reference.slice(0, 10),
    });
  }
  return statusByClient;
}
