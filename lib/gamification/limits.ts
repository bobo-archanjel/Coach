// FitPilot — limity výziev a rebríčka podľa tarify (čisté funkcie, testy: e2e/gamification-b.spec.ts).
// Čísla a zoznamy drží lib/billing/plans.ts (PLANS[tier].limits); tu sú len kontroly, ktoré
// používa server action (createChallengeAction), načítanie rebríčka aj UI.

import { PLANS, type GamificationLimits, type LeaderboardMetricId, type Tier } from "@/lib/billing/plans";

/** Limity pre tarifu; bez prístupu (null) sa berú najprísnejšie (Starter). */
export function gamificationLimits(tier: Tier | null | undefined): GamificationLimits {
  return PLANS[tier ?? "starter"].limits;
}

export type ChallengeLimitError = "limit" | "type" | "targeting";

/**
 * Smie tréner s týmito limitmi vytvoriť výzvu? `activeCount` = jeho momentálne aktívne výzvy.
 * Existujúce výzvy po downgrade bežia ďalej; len nové sa nedajú pridať, kým počet nie je pod limitom.
 */
export function checkChallengeAgainstLimits(
  limits: GamificationLimits,
  input: { metric: string; allClients: boolean; activeCount: number },
): ChallengeLimitError | null {
  if (!(limits.challengeTypes as readonly string[]).includes(input.metric)) return "type";
  if (limits.challengeTargeting === "all" && !input.allClients) return "targeting";
  if (input.activeCount >= limits.maxActiveChallenges) return "limit";
  return null;
}

/** Povolené záložky rebríčka pre tarifu (v poradí tabov). */
export function allowedLeaderboardMetrics(tier: Tier | null | undefined): readonly LeaderboardMetricId[] {
  return gamificationLimits(tier).leaderboardMetrics;
}
