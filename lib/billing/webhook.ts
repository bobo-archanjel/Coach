// FitPilot — spracovanie Stripe webhookov (feature/Stripe). Čistá logika bez importu
// server-only/Next, všetky I/O závislosti (DB, Stripe API) sú vstreknuté → dá sa testovať
// (e2e/billing.spec.ts) s falošnými Stripe objektmi. Skutočné napojenie: lib/billing/server.ts
// a app/api/stripe/webhook/route.ts.
//
// Stavový automat:
//  - zdrojom pravdy je vždy AKTUÁLNY objekt Subscription zo Stripe (pri každej udalosti sa
//    znova načíta cez API), takže poradie doručenia udalostí nehrá rolu a sú idempotentné,
//  - tarifu určuje server z cenového ID (env STRIPE_PRICE_*), nikdy z klienta/metadát,
//  - past_due_since sa odvodzuje z PRECHODU stavu (nie z invoice udalostí),
//  - cudzie (staršie) predplatné neprepíše živé aktuálne, komped účet nikdy nestratí tarifu.

import type Stripe from "stripe";
import type { SubscriptionRow, SubStatus } from "./entitlements";
import { tierForPriceId, type PriceEnv } from "./plans";

export type SubscriptionPatch = Partial<Omit<SubscriptionRow, "trainer_id">>;

export interface BillingStore {
  getByTrainer(trainerId: string): Promise<SubscriptionRow | null>;
  getByCustomer(customerId: string): Promise<SubscriptionRow | null>;
  /** upsert patchu k riadku trénera (service role) */
  save(trainerId: string, patch: SubscriptionPatch): Promise<void>;
}

export type ClaimResult = "new" | "duplicate" | "busy";

export interface EventLog {
  /** zaregistruje event ID; duplicate = už spracované, busy = práve ho spracúva iný request */
  claim(eventId: string, type: string): Promise<ClaimResult>;
  markDone(eventId: string): Promise<void>;
  /** pri chybe uvoľní, aby ho Stripe mohol doručiť znova */
  release(eventId: string): Promise<void>;
}

export interface WebhookDeps {
  store: BillingStore;
  log: EventLog;
  retrieveSubscription(id: string): Promise<Stripe.Subscription>;
  priceEnv?: PriceEnv;
  now?: () => Date;
}

export type WebhookOutcome =
  | { outcome: "processed"; detail?: string }
  | { outcome: "ignored"; detail: string }
  | { outcome: "duplicate" }
  | { outcome: "busy" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KNOWN_STATUSES: SubStatus[] = [
  "trialing", "active", "past_due", "canceled", "unpaid", "incomplete", "incomplete_expired", "paused",
];
/** Stavy, v ktorých je uložené predplatné „živé“ — iné predplatné ho neprepíše. */
const LIVE_STATUSES: SubStatus[] = ["trialing", "active", "past_due", "unpaid", "paused"];

type Loose = Record<string, unknown>;

function idOf(value: unknown): string | null {
  if (typeof value === "string") return value || null;
  if (value && typeof value === "object" && typeof (value as Loose).id === "string") return (value as Loose).id as string;
  return null;
}

function toIso(unixSeconds: unknown): string | null {
  return typeof unixSeconds === "number" && Number.isFinite(unixSeconds) ? new Date(unixSeconds * 1000).toISOString() : null;
}

/** ID predplatného z faktúry — staršie API: invoice.subscription, novšie: invoice.parent.subscription_details. */
export function invoiceSubscriptionId(invoice: unknown): string | null {
  const inv = invoice as Loose;
  const direct = idOf(inv.subscription);
  if (direct) return direct;
  const parent = inv.parent as Loose | null | undefined;
  const details = parent?.subscription_details as Loose | undefined;
  return idOf(details?.subscription);
}

/**
 * Stripe Subscription → zmeny v riadku trainer_subscriptions. `null` = nič nemeniť.
 * Čistá funkcia (testovaná priamo).
 */
export function mapSubscription(
  sub: Stripe.Subscription,
  existing: SubscriptionRow | null,
  now: Date,
  priceEnv?: PriceEnv,
): SubscriptionPatch | null {
  const raw = sub as unknown as Loose;
  const status = raw.status as SubStatus;
  if (!KNOWN_STATUSES.includes(status)) return null;

  // Nedokončená prvá platba nesmie prepísať ešte platnú skúšku (app_trial).
  if ((status === "incomplete" || status === "incomplete_expired") && existing?.status === "app_trial") {
    return status === "incomplete" ? { stripe_subscription_id: sub.id } : null;
  }

  const items = ((raw.items as Loose | undefined)?.data as Loose[] | undefined) ?? [];
  const first = items[0];
  const price = first?.price as Loose | undefined;
  const mappedTier = tierForPriceId(idOf(price), priceEnv);

  // novšie API verzie majú current_period_end na položke predplatného, staršie na predplatnom
  const periodEnd = toIso(first?.current_period_end) ?? toIso(raw.current_period_end);

  const patch: SubscriptionPatch = {
    stripe_subscription_id: sub.id,
    status,
    current_period_end: periodEnd,
    cancel_at_period_end: raw.cancel_at_period_end === true || typeof raw.cancel_at === "number",
    past_due_since:
      status === "past_due"
        ? existing?.status === "past_due" && existing.past_due_since
          ? existing.past_due_since
          : now.toISOString()
        : null,
  };
  const customer = idOf(raw.customer);
  if (customer) patch.stripe_customer_id = customer;
  // Komped účet si tarifu nechá (ručne daný prístup); neznáme cenové ID tarifu nemení.
  if (mappedTier && !existing?.comped) patch.tier = mappedTier;
  return patch;
}

async function applySubscription(
  sub: Stripe.Subscription,
  fallbackTrainerId: string | null,
  deps: WebhookDeps,
): Promise<WebhookOutcome> {
  const raw = sub as unknown as Loose;
  const customerId = idOf(raw.customer);
  const metaTrainer = ((raw.metadata as Loose | undefined)?.trainer_id as string | undefined) ?? fallbackTrainerId;

  let existing: SubscriptionRow | null = null;
  if (customerId) existing = await deps.store.getByCustomer(customerId);
  if (!existing && metaTrainer && UUID_RE.test(metaTrainer)) existing = await deps.store.getByTrainer(metaTrainer);
  if (!existing) return { outcome: "ignored", detail: "unknown_trainer" };

  if (metaTrainer && UUID_RE.test(metaTrainer) && metaTrainer !== existing.trainer_id) {
    return { outcome: "ignored", detail: "trainer_mismatch" };
  }
  if (existing.stripe_customer_id && customerId && existing.stripe_customer_id !== customerId) {
    return { outcome: "ignored", detail: "customer_mismatch" };
  }
  // udalosť staršieho/iného predplatného nesmie prepísať aktuálne živé
  if (
    existing.stripe_subscription_id &&
    existing.stripe_subscription_id !== sub.id &&
    LIVE_STATUSES.includes(existing.status)
  ) {
    return { outcome: "ignored", detail: "other_subscription" };
  }

  const now = (deps.now ?? (() => new Date()))();
  const patch = mapSubscription(sub, existing, now, deps.priceEnv);
  if (!patch) return { outcome: "ignored", detail: "no_change" };
  await deps.store.save(existing.trainer_id, patch);
  return { outcome: "processed", detail: `${existing.trainer_id}:${patch.status ?? existing.status}` };
}

/** Načíta aktuálny stav predplatného zo Stripe; pri zmazanom/neexistujúcom použije dodaný objekt. */
async function currentSubscription(
  id: string,
  payload: Stripe.Subscription | null,
  deps: WebhookDeps,
): Promise<Stripe.Subscription | null> {
  try {
    return await deps.retrieveSubscription(id);
  } catch (err) {
    if ((err as { code?: string })?.code === "resource_missing" && payload) return payload;
    throw err;
  }
}

/** Spracuje jednu (už overenú) udalosť. Neidempotentné — idempotenciu rieši processStripeEvent. */
export async function handleStripeEvent(event: Stripe.Event, deps: WebhookDeps): Promise<WebhookOutcome> {
  const obj = event.data.object as unknown as Loose;

  switch (event.type) {
    case "checkout.session.completed": {
      if (obj.mode !== "subscription") return { outcome: "ignored", detail: "not_subscription" };
      const trainerId = (obj.client_reference_id as string | null) ?? ((obj.metadata as Loose | undefined)?.trainer_id as string | undefined) ?? null;
      const customerId = idOf(obj.customer);
      if (!trainerId || !UUID_RE.test(trainerId) || !customerId) return { outcome: "ignored", detail: "no_trainer" };
      const existing = await deps.store.getByTrainer(trainerId);
      if (!existing) return { outcome: "ignored", detail: "unknown_trainer" };
      if (existing.stripe_customer_id && existing.stripe_customer_id !== customerId) {
        return { outcome: "ignored", detail: "customer_mismatch" };
      }
      if (!existing.stripe_customer_id) await deps.store.save(trainerId, { stripe_customer_id: customerId });
      const subId = idOf(obj.subscription);
      if (!subId) return { outcome: "processed", detail: "linked" };
      const sub = await currentSubscription(subId, null, deps);
      return sub ? applySubscription(sub, trainerId, deps) : { outcome: "ignored", detail: "no_subscription" };
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const payload = event.data.object as Stripe.Subscription;
      const sub = await currentSubscription(payload.id, payload, deps);
      return sub ? applySubscription(sub, null, deps) : { outcome: "ignored", detail: "no_subscription" };
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      const subId = invoiceSubscriptionId(obj);
      if (!subId) return { outcome: "ignored", detail: "invoice_without_subscription" };
      const sub = await currentSubscription(subId, null, deps);
      return sub ? applySubscription(sub, null, deps) : { outcome: "ignored", detail: "no_subscription" };
    }

    default:
      return { outcome: "ignored", detail: `unhandled:${event.type}` };
  }
}

/** Idempotentné spracovanie: event ID sa spracuje najviac raz; pri chybe sa uvoľní pre retry. */
export async function processStripeEvent(event: Stripe.Event, deps: WebhookDeps): Promise<WebhookOutcome> {
  const claim = await deps.log.claim(event.id, event.type);
  if (claim === "duplicate") return { outcome: "duplicate" };
  if (claim === "busy") return { outcome: "busy" };
  try {
    const result = await handleStripeEvent(event, deps);
    await deps.log.markDone(event.id);
    return result;
  } catch (err) {
    await deps.log.release(event.id).catch(() => undefined);
    throw err;
  }
}
