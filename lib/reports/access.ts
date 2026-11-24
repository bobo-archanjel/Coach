// FitPilot — Pokročilé reporty: prístup podľa tarify (čistá funkcia, testy: e2e/reports.spec.ts).
// Reporty sú len na ČÍTANIE, preto platí iná logika než pri AI funkciách (BillingState.features
// je pri read-only účte celé vypnuté): trénerovi nad limitom klientov alebo s vypršaným odkladom
// reporty ostanú, ak jeho tarifa (accessTier) funkciu obsahuje. Bez prístupu (skúška skončila,
// zrušené) a pri Starter/skúške sú zamknuté.

import { PLANS } from "@/lib/billing/plans";
import type { BillingState } from "@/lib/billing/entitlements";

export function reportsUnlocked(state: Pick<BillingState, "accessTier">): boolean {
  return state.accessTier != null && PLANS[state.accessTier].features.advancedReports;
}
