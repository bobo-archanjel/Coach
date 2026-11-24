// FitPilot — výpočet prístupu trénera z riadku predplatného (feature/Stripe).
// Čistá funkcia bez I/O (testy: e2e/billing.spec.ts). Zrkadlí SQL funkciu
// billing_effective_tier z migrácie 0073 a billing_client_limit z 0074 — pri zmene pravidiel
// upraviť OBE miesta.

import { PLANS, clientLimitFor, type Feature, type FeatureFlags, type Tier } from "./plans";

export type SubStatus =
  | "app_trial"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

/** Odklad po zlyhaní platby (dni) — pokrýva Stripe opakované pokusy o stiahnutie. */
export const PAST_DUE_GRACE_DAYS = 7;
/** Dĺžka skúšobnej doby bez karty (dni). */
export const TRIAL_DAYS = 14;
/** Banner „skúška končí“ sa ukáže, keď zostáva toľko dní alebo menej. */
export const TRIAL_WARN_DAYS = 3;

const DAY_MS = 86_400_000;

/** Riadok trainer_subscriptions (časy ako ISO reťazce, tak ako ich vráti PostgREST). */
export interface SubscriptionRow {
  trainer_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  tier: Tier;
  status: SubStatus;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  past_due_since: string | null;
  comped: boolean;
  /** limit aktívnych klientov uložený webhookom z ceny; null = predvolený limit tarify (Business = bez limitu) */
  client_limit: number | null;
  /** naplánovaná zmena tarify na konci zaplateného obdobia (downgrade); null = žiadna */
  scheduled_tier: Tier | null;
  scheduled_client_limit: number | null;
  scheduled_change_at: string | null;
}

/** Naplánovaná zmena tarify (downgrade na konci obdobia) pripravená na zobrazenie. */
export interface ScheduledChange {
  tier: Tier;
  /** limit klientov po zmene (null = bez limitu) */
  clientLimit: number | null;
  /** kedy zmena nastane (ISO) */
  at: string;
  /** počet aktívnych klientov presahuje limit po zmene → po prechode bude účet len na čítanie */
  overLimit: boolean;
}

export type ReadOnlyReason =
  | "no_subscription" // riadok neexistuje
  | "trial_ended" // skúška skončila, žiadne predplatné
  | "subscription_ended" // zrušené / nezaplatené / nedokončené
  | "past_due_expired" // odklad po zlyhanej platbe vypršal
  | "over_limit"; // viac aktívnych klientov, než dovoľuje tarifa

export interface BillingState {
  /** tarifa uložená v riadku (aj keď prístup už vypršal) */
  tier: Tier | null;
  status: SubStatus | null;
  comped: boolean;
  /** tarifa, ktorá teraz reálne platí; null = žiadny prístup */
  accessTier: Tier | null;
  /** odomknuté funkcie (pri read-only všetko false — AI/zápis je vypnutý) */
  features: FeatureFlags;
  readOnly: boolean;
  reason: ReadOnlyReason | null;
  clientCount: number;
  /** limit aktívnych klientov (null = bez limitu); pri žiadnom prístupe 0 */
  clientLimit: number | null;
  /** môže tréner teraz pridať ďalšieho klienta */
  canAddClient: boolean;
  /** zostávajúce dni skúšky (len status app_trial, inak null) */
  trialDaysLeft: number | null;
  trialEndsAt: string | null;
  /** zostávajúce dni odkladu po zlyhanej platbe (len past_due v odklade) */
  graceDaysLeft: number | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  /** naplánovaná zmena tarify (len platené predplatné, nie komped/zrušenie) */
  scheduledChange: ScheduledChange | null;
}

const NO_FEATURES = PLANS.starter.features;

/** Limit aktívnych klientov riadku (null = bez limitu). Zrkadlo SQL billing_client_limit. */
export function rowClientLimit(row: SubscriptionRow): number | null {
  return clientLimitFor(row.tier, row.client_limit);
}

/** Naplánovaná zmena z riadku (len ak predplatné nekončí a zmena je v budúcnosti). */
export function scheduledChangeOf(row: SubscriptionRow | null, activeClients: number, now: Date): ScheduledChange | null {
  if (!row || row.comped || row.cancel_at_period_end) return null;
  if (!row.scheduled_tier || !row.scheduled_change_at) return null;
  if (Date.parse(row.scheduled_change_at) <= now.getTime()) return null;
  if (row.status !== "active" && row.status !== "trialing" && row.status !== "past_due") return null;
  const clientLimit = clientLimitFor(row.scheduled_tier, row.scheduled_client_limit);
  return {
    tier: row.scheduled_tier,
    clientLimit,
    at: row.scheduled_change_at,
    overLimit: clientLimit !== null && activeClients > clientLimit,
  };
}

/** Tarifa, ktorá platí práve teraz (null = žiadny prístup). Zrkadlo SQL billing_effective_tier. */
export function effectiveTier(row: SubscriptionRow | null, now: Date = new Date()): Tier | null {
  if (!row) return null;
  if (row.comped) return row.tier;
  switch (row.status) {
    case "app_trial":
      return row.trial_ends_at && Date.parse(row.trial_ends_at) > now.getTime() ? row.tier : null;
    case "trialing":
    case "active":
      return row.tier;
    case "past_due": {
      if (!row.past_due_since) return row.tier;
      return Date.parse(row.past_due_since) + PAST_DUE_GRACE_DAYS * DAY_MS > now.getTime() ? row.tier : null;
    }
    default:
      return null;
  }
}

function lapsedReason(row: SubscriptionRow | null): ReadOnlyReason {
  if (!row) return "no_subscription";
  if (row.status === "app_trial") return "trial_ended";
  if (row.status === "past_due") return "past_due_expired";
  return "subscription_ended";
}

export function computeBilling(row: SubscriptionRow | null, activeClients: number, now: Date = new Date()): BillingState {
  const accessTier = effectiveTier(row, now);
  const plan = accessTier ? PLANS[accessTier] : null;
  const clientLimit = plan && row ? rowClientLimit(row) : 0;
  const overLimit = clientLimit !== null && activeClients > clientLimit;

  let readOnly = false;
  let reason: ReadOnlyReason | null = null;
  if (!accessTier) {
    readOnly = true;
    reason = lapsedReason(row);
  } else if (overLimit) {
    readOnly = true;
    reason = "over_limit";
  }

  const canAddClient = !readOnly && (clientLimit === null || activeClients < clientLimit);

  let trialDaysLeft: number | null = null;
  if (row && !row.comped && row.status === "app_trial" && row.trial_ends_at) {
    trialDaysLeft = Math.max(0, Math.ceil((Date.parse(row.trial_ends_at) - now.getTime()) / DAY_MS));
  }

  let graceDaysLeft: number | null = null;
  if (row && !row.comped && row.status === "past_due" && accessTier && row.past_due_since) {
    graceDaysLeft = Math.max(
      0,
      Math.ceil((Date.parse(row.past_due_since) + PAST_DUE_GRACE_DAYS * DAY_MS - now.getTime()) / DAY_MS),
    );
  }

  return {
    tier: row?.tier ?? null,
    status: row?.status ?? null,
    comped: row?.comped ?? false,
    accessTier,
    features: plan && !readOnly ? plan.features : NO_FEATURES,
    readOnly,
    reason,
    clientCount: activeClients,
    clientLimit,
    canAddClient,
    trialDaysLeft,
    trialEndsAt: row?.trial_ends_at ?? null,
    graceDaysLeft,
    cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
    currentPeriodEnd: row?.current_period_end ?? null,
    scheduledChange: scheduledChangeOf(row, activeClients, now),
  };
}

/** Má tréner funkciu odomknutú (a nie je read-only)? */
export function hasFeature(state: BillingState, feature: Feature): boolean {
  return state.features[feature];
}

/** Je „AI Kouč pre klientov“ dostupný? Pre klienta ráta len tarifu trénera (nie read-only nad limitom). */
export function coachAvailableForClients(row: SubscriptionRow | null, now: Date = new Date()): boolean {
  const tier = effectiveTier(row, now);
  return tier ? PLANS[tier].features.aiCoach : false;
}

/**
 * Smie sa klientom ukazovať značka (branding) trénera? Rovnako ako pri AI Koučovi rozhoduje
 * len tarifa trénera (nie read-only nad limitom klientov) — pri strate Business sa značka
 * ticho prestane zobrazovať, dáta ostávajú. Zrkadlo SQL: billing_effective_tier(...) = 'business'.
 */
export function brandingAvailableForClients(row: SubscriptionRow | null, now: Date = new Date()): boolean {
  const tier = effectiveTier(row, now);
  return tier ? PLANS[tier].features.branding : false;
}
