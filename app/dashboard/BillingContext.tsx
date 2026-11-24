"use client";

// Stav predplatného trénera pre klientské komponenty dashboardu (feature/Stripe) — len na
// zobrazenie (zamknuté tlačidlá, odznaky). Skutočné vynútenie je VŽDY na serveri
// (lib/billing/server.ts → trainerBlock) a v DB triggeroch (0073); toto UI nikoho nechráni.

import { createContext, useContext, type ReactNode } from "react";
import { computeBilling, type BillingState } from "@/lib/billing/entitlements";

const BillingContext = createContext<BillingState | null>(null);

export function BillingProvider({ state, children }: { state: BillingState | null; children: ReactNode }) {
  return <BillingContext.Provider value={state}>{children}</BillingContext.Provider>;
}

/** Mimo providera (napr. DEV náhľad bez session) sa nič nezamyká. */
const OPEN: BillingState = computeBilling(
  {
    trainer_id: "",
    stripe_customer_id: null,
    stripe_subscription_id: null,
    tier: "business",
    status: "active",
    trial_ends_at: null,
    current_period_end: null,
    cancel_at_period_end: false,
    past_due_since: null,
    comped: true,
    client_limit: null,
    scheduled_tier: null,
    scheduled_client_limit: null,
    scheduled_change_at: null,
  },
  0,
);

export function useBilling(): BillingState {
  return useContext(BillingContext) ?? OPEN;
}
