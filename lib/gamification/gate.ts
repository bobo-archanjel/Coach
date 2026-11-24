// FitPilot — kto vidí výzvy a rebríček na strane trénera (čistá funkcia, testy: e2e/gamification-b.spec.ts).
// Rovnaká logika ako pokročilé reporty (lib/reports/access.ts): ide o zobrazenie, preto tréner
// nad limitom klientov alebo s vypršaným odkladom funkciu vidí (len na čítanie), ak ju jeho
// tarifa obsahuje; bez prístupu (skúška skončila, zrušené) a pri Starter je zamknutá.
// ZÁPISY chráni server (trainerBlock s feature) — táto funkcia je len pre UI.

import { PLANS } from "@/lib/billing/plans";
import type { BillingState } from "@/lib/billing/entitlements";

export function challengesUnlocked(state: Pick<BillingState, "accessTier">): boolean {
  return state.accessTier != null && PLANS[state.accessTier].features.challenges;
}

export function leaderboardUnlocked(state: Pick<BillingState, "accessTier">): boolean {
  return state.accessTier != null && PLANS[state.accessTier].features.leaderboard;
}
