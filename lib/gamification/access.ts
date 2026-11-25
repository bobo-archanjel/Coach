import "server-only";
import { cache } from "react";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { effectiveTier, featureAvailableForClients, type SubscriptionRow } from "@/lib/billing/entitlements";
import type { Feature, Tier } from "@/lib/billing/plans";

// FitPilot — dostupnosť funkcií trénera pre jeho KLIENTOV (výzvy, rebríček). Klient riadok
// predplatného cez RLS nevidí, preto service role; výsledok je len áno/nie. Volajúci MUSÍ
// trainerId zistiť z overeného vzťahu (clients.trainer_id prihláseného klienta).
// Fail-closed: chyba alebo chýbajúci kľúč = funkcia nie je dostupná.

const SUB_COLUMNS =
  "trainer_id, stripe_customer_id, stripe_subscription_id, tier, status, trial_ends_at, current_period_end, cancel_at_period_end, past_due_since, comped, client_limit, scheduled_tier, scheduled_client_limit, scheduled_change_at";

/** Riadok predplatného trénera (service role); null = chýba alebo chyba (fail-closed). */
export const loadTrainerSubscriptionRow = cache(async (trainerId: string): Promise<SubscriptionRow | null> => {
  const admin = tryCreateAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.from("trainer_subscriptions").select(SUB_COLUMNS).eq("trainer_id", trainerId).maybeSingle();
  if (error) {
    console.error("gamification.access:", error.message);
    return null;
  }
  return (data as SubscriptionRow | null) ?? null;
});

export const trainerHasFeatureForClients = cache(async (trainerId: string | null | undefined, feature: Feature): Promise<boolean> => {
  if (!trainerId) return false;
  return featureAvailableForClients(await loadTrainerSubscriptionRow(trainerId), feature);
});

/** Tarifa trénera, ktorá teraz platí (pre limity rebríčka); null = bez prístupu. */
export const trainerTierForClients = cache(async (trainerId: string | null | undefined): Promise<Tier | null> => {
  if (!trainerId) return null;
  return effectiveTier(await loadTrainerSubscriptionRow(trainerId));
});
