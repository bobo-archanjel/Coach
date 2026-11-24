import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// FitPilot — feed úspechov klientov pre trénera (dashboard + detail klienta).
// Čítanie cez bežný klient (RLS 0078: tréner vidí len svojich súčasných klientov) a navyše
// explicitný filter clients.trainer_id. Spätne dopočítané (backfilled) úspechy sa nezobrazujú —
// „high five“ za rekord spred pol roka by nedával zmysel.

export interface FeedItem {
  id: string;
  clientId: string;
  clientName: string;
  kind: "pr" | "badge";
  badgeId: string | null;
  exerciseName: string | null;
  value: number | null;
  reps: number | null;
  achievedAt: string;
  highFived: boolean;
}

interface FeedRow {
  id: string;
  client_id: string;
  kind: "pr" | "badge";
  badge_id: string | null;
  exercise_name: string | null;
  value: number | string | null;
  reps: number | null;
  achieved_at: string;
  clients: { full_name: string; ended_at: string | null; deletion_requested_at: string | null } | null;
  high_fives: { id: string } | { id: string }[] | null;
}

export const FEED_DAYS = 14;

/** Najnovšie úspechy klientov trénera (alebo jedného klienta); prázdne pri chybe / pred migráciou. */
export async function loadAchievementsFeed(
  supabase: SupabaseClient,
  trainerId: string,
  opts: { clientId?: string; limit?: number; days?: number } = {},
): Promise<FeedItem[]> {
  const since = new Date(Date.now() - (opts.days ?? FEED_DAYS) * 86_400_000).toISOString();
  let q = supabase
    .from("client_achievements")
    .select(
      "id, client_id, kind, badge_id, exercise_name, value, reps, achieved_at, clients!inner(full_name, trainer_id, ended_at, deletion_requested_at), high_fives(id)",
    )
    .eq("backfilled", false)
    .eq("clients.trainer_id", trainerId)
    .gte("achieved_at", since)
    .order("achieved_at", { ascending: false })
    .limit(opts.limit ?? 12);
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  const { data, error } = await q;
  if (error) return [];
  return ((data ?? []) as unknown as FeedRow[])
    .filter((r) => r.clients && !r.clients.ended_at && !r.clients.deletion_requested_at)
    .map((r) => ({
      id: r.id,
      clientId: r.client_id,
      clientName: r.clients!.full_name,
      kind: r.kind,
      badgeId: r.badge_id,
      exerciseName: r.exercise_name,
      value: r.value != null ? Number(r.value) : null,
      reps: r.reps,
      achievedAt: r.achieved_at,
      highFived: Array.isArray(r.high_fives) ? r.high_fives.length > 0 : Boolean(r.high_fives),
    }));
}
