// FitPilot — spracovanie Stripe webhookov (feature/Stripe). Čistá logika bez importu
// server-only/Next, všetky I/O závislosti (DB, Stripe API) sú vstreknuté → dá sa testovať
// (e2e/billing.spec.ts) s falošnými Stripe objektmi. Skutočné napojenie: lib/billing/server.ts
// a app/api/stripe/webhook/route.ts.
//
// Stavový automat:
//  - zdrojom pravdy je vždy AKTUÁLNY objekt Subscription zo Stripe (pri každej udalosti sa
//    znova načíta cez API), takže poradie doručenia udalostí nehrá rolu a sú idempotentné,
//  - tarifu a limit klientov určuje server z ceny (env STRIPE_PRICE_* / lookup_key ceny), nikdy z klienta/metadát,
//  - downgrade z Customer Portalu sa vo Stripe robí cez subscription schedule: aktuálna cena ostáva
//    pôvodná až do konca obdobia (tarifa sa nemení skôr), budúca fáza sa ukladá ako scheduled_* na zobrazenie,
//  - past_due_since sa odvodzuje z PRECHODU stavu (nie z invoice udalostí),
//  - cudzie (staršie) predplatné neprepíše živé aktuálne, komped účet nikdy nestratí tarifu.

import type Stripe from "stripe";
import type { SubscriptionRow, SubStatus } from "./entitlements";
import { planForPrice, type Plan, type PriceEnv } from "./plans";

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
  /** načítanie subscription schedule (s rozbalenými cenami fáz); bez neho sa naplánované zmeny nesledujú */
  retrieveSchedule?(id: string): Promise<Stripe.SubscriptionSchedule>;
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
  schedule?: Stripe.SubscriptionSchedule | null,
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
  const plan = planForPrice(
    price
      ? { id: idOf(price), lookup_key: (price.lookup_key as string | null | undefined) ?? null, metadata: price.metadata as Record<string, string> | undefined }
      : null,
    priceEnv,
  );

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
  // Komped účet si tarifu aj limit nechá (ručne daný prístup); neznáma cena tarifu ani limit nemení.
  if (plan && !existing?.comped) {
    patch.tier = plan.tier;
    patch.client_limit = plan.clientLimit;
  }

  // naplánovaná zmena (downgrade na konci obdobia) — len pre živé platené predplatné, ktoré nekončí
  const next =
    !existing?.comped && patch.cancel_at_period_end !== true && LIVE_STATUSES.includes(status) && status !== "paused"
      ? scheduledChangeFromSchedule(schedule ?? null, plan, now, priceEnv)
      : null;
  patch.scheduled_tier = next?.plan.tier ?? null;
  patch.scheduled_client_limit = next ? next.plan.clientLimit : null;
  patch.scheduled_change_at = next?.at ?? null;
  return patch;
}

/**
 * Budúca fáza subscription schedule, ktorá mení cenu (downgrade z Portalu „na konci obdobia“).
 * null = žiadna zmena (alebo cena fázy sa nedá namapovať, alebo je rovnaká ako súčasná).
 */
export function scheduledChangeFromSchedule(
  schedule: Stripe.SubscriptionSchedule | null,
  current: Plan | null,
  now: Date,
  priceEnv?: PriceEnv,
): { plan: Plan; at: string } | null {
  if (!schedule) return null;
  const status = (schedule as unknown as Loose).status;
  if (status !== "active" && status !== "not_started") return null;
  const phases = ((schedule as unknown as Loose).phases as Loose[] | undefined) ?? [];
  const upcoming = phases
    .filter((ph) => typeof ph.start_date === "number" && (ph.start_date as number) * 1000 > now.getTime())
    .sort((a, b) => (a.start_date as number) - (b.start_date as number))[0];
  if (!upcoming) return null;
  const item = ((upcoming.items as Loose[] | undefined) ?? [])[0];
  const price = item?.price as unknown;
  const plan =
    typeof price === "string"
      ? planForPrice(price, priceEnv)
      : price && typeof price === "object"
        ? planForPrice(
            { id: idOf(price), lookup_key: ((price as Loose).lookup_key as string | null) ?? null, metadata: (price as Loose).metadata as Record<string, string> | undefined },
            priceEnv,
          )
        : null;
  if (!plan) return null;
  if (current && current.variant === plan.variant) return null;
  const at = toIso(upcoming.start_date);
  return at ? { plan, at } : null;
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
  const scheduleId = idOf(raw.schedule);
  let schedule: Stripe.SubscriptionSchedule | null = null;
  if (scheduleId && deps.retrieveSchedule) {
    try {
      schedule = await deps.retrieveSchedule(scheduleId);
    } catch (err) {
      if ((err as { code?: string })?.code !== "resource_missing") throw err;
    }
  }
  const patch = mapSubscription(sub, existing, now, deps.priceEnv, schedule);
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

    // zmena plánu v Portalu „na konci obdobia“ sa deje cez subscription schedule — pri úprave
    // fáz nemusí prísť customer.subscription.updated, preto sa sledujú aj udalosti schedule
    case "subscription_schedule.created":
    case "subscription_schedule.updated":
    case "subscription_schedule.released":
    case "subscription_schedule.canceled":
    case "subscription_schedule.completed":
    case "subscription_schedule.aborted": {
      const subId = idOf(obj.subscription) ?? idOf(obj.released_subscription);
      if (!subId) return { outcome: "ignored", detail: "schedule_without_subscription" };
      const sub = await currentSubscription(subId, null, deps);
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
