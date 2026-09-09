"use server";

import { createClient, getUser } from "@/lib/supabase/server";
import { getClientAnalyticsOverview } from "@/lib/dashboard/analytics";
import { getRecentPRs } from "@/lib/dashboard/bodyMetrics";
import { generateRosterSummary, type RosterSummaryClientInput } from "@/lib/ai/rosterSummary";

export interface RosterSummaryState {
  summary: string | null;
  error: string | null;
}
const empty: RosterSummaryState = { summary: null, error: null };

/**
 * AI týždenný digest celého portfólia (feature/analytika-v2, bod 5) — on-demand,
 * žiadny cron. Ownership: klientov načítavame scoped na prihláseného trénera
 * (rovnaký filter aktívnych ako /dashboard/analytika page), `generateRosterSummary`
 * dostáva už len hotové čísla. Vlastný denný rate-limit per tréner
 * (isRosterSummaryRateLimited) je vnútri `generateRosterSummary`.
 */
export async function generateRosterSummaryAction(): Promise<RosterSummaryState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await getUser();
  if (!user) return { ...empty, error: "Nie si prihlásený." };

  const { data: clients } = await supabase
    .from("clients")
    .select("id, full_name, goal, ended_at, deletion_requested_at")
    .eq("trainer_id", user.id)
    .order("full_name");

  const active = (clients ?? []).filter((c) => !c.ended_at && !c.deletion_requested_at);
  if (active.length === 0) return { ...empty, error: "Zatiaľ nemáš aktívnych klientov na zhrnutie." };

  const ids = active.map((c) => c.id);
  const [overview, recentPRs] = await Promise.all([getClientAnalyticsOverview(ids), getRecentPRs(ids, 14)]);
  if (!overview) return { ...empty, error: "Prehľad sa nepodarilo načítať — skús to znova." };

  const nowMs = Date.now();
  const inputs: RosterSummaryClientInput[] = active
    .map((c): RosterSummaryClientInput | null => {
      const row = overview.get(c.id);
      if (!row) return null;
      const daysSinceLastTrained = row.lastTrainedOn
        ? Math.floor((nowMs - new Date(`${row.lastTrainedOn}T12:00:00Z`).getTime()) / 86_400_000)
        : null;
      return {
        name: c.full_name,
        goal: c.goal,
        trainingPct30: row.trainingPct30,
        nutritionPct30: row.nutritionPct30,
        planCompletionPct30: row.planCompletionPct30,
        weightDeltaKg: row.weightDeltaKg,
        daysSinceLastTrained,
        recentPRs: (recentPRs?.get(c.id) ?? []).map((p) => ({ exercise: p.exercise, bestWeightKg: p.bestWeightKg })),
      };
    })
    .filter((x): x is RosterSummaryClientInput => x != null);

  const result = await generateRosterSummary(supabase, { trainerId: user.id, clients: inputs });
  if (result.status === "ok") return { summary: result.summary, error: null };
  return { summary: null, error: result.summary };
}
