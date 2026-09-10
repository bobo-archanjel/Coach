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
}

/** Per-klient stav meškania — len pre klientov, ktorí majú aspoň jeden priradený plán. */
export async function getLateStatusByClient(
  supabase: SupabaseClient,
  clientIds: string[],
): Promise<Map<string, LateStatus>> {
  const statusByClient = new Map<string, LateStatus>();
  if (clientIds.length === 0) return statusByClient;

  const [{ data: plans }, { data: logs }] = await Promise.all([
    supabase
      .from("workout_plans")
      .select("client_id, created_at")
      .in("client_id", clientIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("workout_logs")
      .select("client_id, performed_on")
      .in("client_id", clientIds)
      .order("performed_on", { ascending: false }),
  ]);

  const latestPlanByClient = new Map<string, string>();
  for (const p of plans ?? []) {
    if (!latestPlanByClient.has(p.client_id)) latestPlanByClient.set(p.client_id, p.created_at);
  }
  const latestLogByClient = new Map<string, string>();
  for (const l of logs ?? []) {
    if (!latestLogByClient.has(l.client_id)) latestLogByClient.set(l.client_id, l.performed_on);
  }

  const todayMs = Date.now();
  for (const [clientId, planCreatedAt] of latestPlanByClient) {
    const reference = latestLogByClient.get(clientId) ?? planCreatedAt;
    const days = Math.floor((todayMs - new Date(reference).getTime()) / 86_400_000);
    statusByClient.set(clientId, { days, tone: days >= LATE_THRESHOLD_DAYS ? "late" : "active" });
  }
  return statusByClient;
}
