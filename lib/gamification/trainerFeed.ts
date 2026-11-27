import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { badgeById, canonicalBadgeId } from "./badges";
import { challengeNameOf, type AchievementKind } from "./kinds";

// FitPilot — feed úspechov klientov pre trénera (dashboard + detail klienta).
// Čítanie cez bežný klient (RLS 0078: tréner vidí len svojich súčasných klientov) a navyše
// explicitný filter clients.trainer_id. Spätne dopočítané (backfilled) úspechy sa nezobrazujú —
// „high five“ za rekord spred pol roka by nedával zmysel.

export interface FeedItem {
  id: string;
  clientId: string;
  clientName: string;
  kind: AchievementKind;
  challengeName: string | null;
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
  kind: AchievementKind;
  meta: unknown;
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
  opts: { clientId?: string; limit?: number; days?: number; onlyPending?: boolean } = {},
): Promise<FeedItem[]> {
  const since = new Date(Date.now() - (opts.days ?? FEED_DAYS) * 86_400_000).toISOString();
  let q = supabase
    .from("client_achievements")
    .select(
      "id, client_id, kind, meta, badge_id, exercise_name, value, reps, achieved_at, clients!inner(full_name, trainer_id, ended_at, deletion_requested_at), high_fives!left(id)",
    )
    .eq("backfilled", false)
    // oslavy postupu na vyššiu úroveň (kind 'level') sú len pre klienta; tréner ich vo feede nemá
    .in("kind", ["pr", "badge", "challenge"])
    .eq("clients.trainer_id", trainerId)
    .gte("achieved_at", since)
    .order("achieved_at", { ascending: false })
    .limit(opts.limit ?? 12);
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  // len úspechy bez high five — filter v dopyte (anti-join), aby limit nezaberali vybavené
  if (opts.onlyPending) q = q.is("high_fives", null);
  const { data, error } = await q;
  if (error) return [];
  return ((data ?? []) as unknown as FeedRow[])
    .filter((r) => r.clients && !r.clients.ended_at && !r.clients.deletion_requested_at)
    .map((r) => ({
      id: r.id,
      clientId: r.client_id,
      clientName: r.clients!.full_name,
      kind: r.kind,
      challengeName: challengeNameOf(r.meta),
      badgeId: r.badge_id,
      exerciseName: r.exercise_name,
      value: r.value != null ? Number(r.value) : null,
      reps: r.reps,
      achievedAt: r.achieved_at,
      highFived: Array.isArray(r.high_fives) ? r.high_fives.length > 0 : Boolean(r.high_fives),
    }));
}


/** Krátky text úspechu pre trénera („Nový rekord: …“); prázdny, ak sa nedá zostaviť. `t` = getTranslations("gamification"). */
export function describeAchievement(
  i: Pick<FeedItem, "kind" | "exerciseName" | "value" | "reps" | "challengeName" | "badgeId">,
  t: (key: never, values?: Record<string, string | number>) => string,
): string {
  const tr = t as (key: string, values?: Record<string, string | number>) => string;
  if (i.kind === "pr" && i.exerciseName && i.value != null) {
    return i.reps
      ? tr("trainer.prReps", { exercise: i.exerciseName, weight: i.value, reps: i.reps })
      : tr("trainer.pr", { exercise: i.exerciseName, weight: i.value });
  }
  if (i.kind === "challenge") return i.challengeName ? tr("trainer.challenge", { name: i.challengeName }) : "";
  const def = i.badgeId ? badgeById(canonicalBadgeId(i.badgeId)) : undefined;
  return def ? tr("trainer.badge", { badge: tr(`badges.${def.id}.name`) }) : "";
}
