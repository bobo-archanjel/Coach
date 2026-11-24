// i18n-ignore-file: testy predplatného (feature/Stripe) — čisté testy bez siete a bez DB
import { test, expect } from "@playwright/test";
import Stripe from "stripe";
import { PLANS, minTierFor, priceIdForTier, tierForPriceId } from "../lib/billing/plans";
import {
  PAST_DUE_GRACE_DAYS,
  computeBilling,
  coachAvailableForClients,
  effectiveTier,
  type SubscriptionRow,
} from "../lib/billing/entitlements";
import {
  invoiceSubscriptionId,
  mapSubscription,
  processStripeEvent,
  type BillingStore,
  type EventLog,
  type SubscriptionPatch,
  type WebhookDeps,
} from "../lib/billing/webhook";

/** Entitlements, read-only logika a mapovanie Stripe udalostí → stav v DB. */

const NOW = new Date("2026-12-01T12:00:00Z");
const DAY = 86_400_000;
const iso = (offsetDays: number) => new Date(NOW.getTime() + offsetDays * DAY).toISOString();
const TRAINER = "11111111-1111-4111-8111-111111111111";
const OTHER_TRAINER = "22222222-2222-4222-8222-222222222222";

const ENV = { STRIPE_PRICE_STARTER: "price_s", STRIPE_PRICE_PRO: "price_p", STRIPE_PRICE_BUSINESS: "price_b" };

function row(over: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    trainer_id: TRAINER,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    tier: "starter",
    status: "app_trial",
    trial_ends_at: iso(10),
    current_period_end: null,
    cancel_at_period_end: false,
    past_due_since: null,
    comped: false,
    ...over,
  };
}

test.describe("tarify a ceny", () => {
  test("limity klientov a funkcie podľa tarify", () => {
    expect(PLANS.starter.maxClients).toBe(10);
    expect(PLANS.pro.maxClients).toBe(50);
    expect(PLANS.business.maxClients).toBeNull();
    expect(PLANS.starter.features.aiCoach).toBe(false);
    for (const f of ["aiCoach", "aiPlanGenerator", "aiMealGenerator", "aiSummaries"] as const) {
      expect(PLANS.pro.features[f]).toBe(true);
      expect(PLANS.business.features[f]).toBe(true);
    }
    expect(PLANS.pro.features.advancedReports).toBe(false);
    expect(PLANS.business.features.advancedReports).toBe(true);
    expect(PLANS.business.features.branding).toBe(true);
    expect(PLANS.pro.features.branding).toBe(false);
    expect(minTierFor("aiCoach")).toBe("pro");
    expect(minTierFor("branding")).toBe("business");
  });

  test("cenové ID ↔ tarifa sa určuje na serveri z env", () => {
    expect(priceIdForTier("pro", ENV)).toBe("price_p");
    expect(tierForPriceId("price_b", ENV)).toBe("business");
    expect(tierForPriceId("price_unknown", ENV)).toBeNull();
    expect(tierForPriceId(null, ENV)).toBeNull();
    // nenastavená env premenná nesmie zhodnúť prázdne ID s tarifou
    expect(tierForPriceId("", {})).toBeNull();
    expect(priceIdForTier("starter", {})).toBeNull();
  });
});

test.describe("read-only a oprávnenia", () => {
  test("nový tréner: skúška starter, 14 dní, bez AI", () => {
    const s = computeBilling(row({ trial_ends_at: iso(14) }), 3, NOW);
    expect(s.readOnly).toBe(false);
    expect(s.accessTier).toBe("starter");
    expect(s.trialDaysLeft).toBe(14);
    expect(s.features.aiCoach).toBe(false);
    expect(s.clientLimit).toBe(10);
    expect(s.canAddClient).toBe(true);
  });

  test("skúška skončila bez predplatného → read-only (trial_ended)", () => {
    const s = computeBilling(row({ trial_ends_at: iso(-1) }), 2, NOW);
    expect(s.readOnly).toBe(true);
    expect(s.reason).toBe("trial_ended");
    expect(s.accessTier).toBeNull();
    expect(s.canAddClient).toBe(false);
    expect(Object.values(s.features).some(Boolean)).toBe(false);
  });

  test("komped: natrvalo business bez limitu, aj keď status nie je platený", () => {
    const s = computeBilling(row({ comped: true, tier: "business", status: "canceled", trial_ends_at: null }), 500, NOW);
    expect(s.readOnly).toBe(false);
    expect(s.accessTier).toBe("business");
    expect(s.clientLimit).toBeNull();
    expect(s.features.branding).toBe(true);
    expect(s.trialDaysLeft).toBeNull();
  });

  test("aktívne predplatné pro odomkne AI, zrušené/nezaplatené je read-only", () => {
    const active = computeBilling(row({ status: "active", tier: "pro" }), 20, NOW);
    expect(active.readOnly).toBe(false);
    expect(active.features.aiPlanGenerator).toBe(true);
    for (const status of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"] as const) {
      const s = computeBilling(row({ status, tier: "pro" }), 1, NOW);
      expect(s.readOnly, status).toBe(true);
      expect(s.reason, status).toBe("subscription_ended");
    }
  });

  test("past_due: 7 dní odklad od past_due_since, potom read-only", () => {
    const inside = computeBilling(row({ status: "past_due", tier: "pro", past_due_since: iso(-(PAST_DUE_GRACE_DAYS - 1)) }), 5, NOW);
    expect(inside.readOnly).toBe(false);
    expect(inside.graceDaysLeft).toBe(1);
    const outside = computeBilling(row({ status: "past_due", tier: "pro", past_due_since: iso(-(PAST_DUE_GRACE_DAYS + 1)) }), 5, NOW);
    expect(outside.readOnly).toBe(true);
    expect(outside.reason).toBe("past_due_expired");
    // presne na hranici 7 dní už prístup nie je
    expect(effectiveTier(row({ status: "past_due", tier: "pro", past_due_since: iso(-PAST_DUE_GRACE_DAYS) }), NOW)).toBeNull();
  });

  test("viac klientov než limit (po downgrade) → read-only over_limit; na limite ešte nie", () => {
    const over = computeBilling(row({ status: "active", tier: "starter" }), 11, NOW);
    expect(over.readOnly).toBe(true);
    expect(over.reason).toBe("over_limit");
    const atLimit = computeBilling(row({ status: "active", tier: "starter" }), 10, NOW);
    expect(atLimit.readOnly).toBe(false);
    expect(atLimit.canAddClient).toBe(false); // pridať ďalšieho sa nesmie ani mimo read-only
    const below = computeBilling(row({ status: "active", tier: "starter" }), 9, NOW);
    expect(below.canAddClient).toBe(true);
  });

  test("chýbajúci riadok = uzavreté (read-only, žiadne funkcie)", () => {
    const s = computeBilling(null, 0, NOW);
    expect(s.readOnly).toBe(true);
    expect(s.reason).toBe("no_subscription");
  });

  test("AI Kouč pre klientov závisí od tarify trénera, nie od počtu klientov", () => {
    expect(coachAvailableForClients(row({ status: "active", tier: "pro" }), NOW)).toBe(true);
    expect(coachAvailableForClients(row({ status: "active", tier: "business" }), NOW)).toBe(true);
    expect(coachAvailableForClients(row({ status: "active", tier: "starter" }), NOW)).toBe(false);
    expect(coachAvailableForClients(row({ status: "app_trial", tier: "starter" }), NOW)).toBe(false);
    expect(coachAvailableForClients(row({ status: "canceled", tier: "pro" }), NOW)).toBe(false);
    expect(coachAvailableForClients(null, NOW)).toBe(false);
    expect(coachAvailableForClients(row({ comped: true, tier: "business", status: "canceled" }), NOW)).toBe(true);
  });
});

// ---------- falošné Stripe objekty ----------

function sub(over: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: "sub_1",
    object: "subscription",
    status: "active",
    customer: "cus_1",
    cancel_at_period_end: false,
    cancel_at: null,
    metadata: { trainer_id: TRAINER },
    items: { data: [{ price: { id: "price_p" }, current_period_end: 1_800_000_000 }] },
    ...over,
  } as unknown as Stripe.Subscription;
}

test.describe("mapSubscription", () => {
  test("tarifa sa určí z cenového ID, obdobie z položky predplatného", () => {
    const patch = mapSubscription(sub(), row(), NOW, ENV)!;
    expect(patch.tier).toBe("pro");
    expect(patch.status).toBe("active");
    expect(patch.stripe_customer_id).toBe("cus_1");
    expect(patch.current_period_end).toBe(new Date(1_800_000_000 * 1000).toISOString());
    expect(patch.past_due_since).toBeNull();
  });

  test("staršie API: current_period_end na predplatnom", () => {
    const old = sub({ items: { data: [{ price: { id: "price_s" } }] }, current_period_end: 1_700_000_000 });
    expect(mapSubscription(old, row(), NOW, ENV)!.current_period_end).toBe(new Date(1_700_000_000 * 1000).toISOString());
  });

  test("neznáme cenové ID nezmení tarifu", () => {
    const patch = mapSubscription(sub({ items: { data: [{ price: { id: "price_x" } }] } }), row({ tier: "pro" }), NOW, ENV)!;
    expect(patch.tier).toBeUndefined();
  });

  test("past_due_since sa nastaví pri prechode a pri ďalších past_due udalostiach nemení", () => {
    const first = mapSubscription(sub({ status: "past_due" }), row({ status: "active" }), NOW, ENV)!;
    expect(first.past_due_since).toBe(NOW.toISOString());
    const since = iso(-3);
    const again = mapSubscription(sub({ status: "past_due" }), row({ status: "past_due", past_due_since: since }), NOW, ENV)!;
    expect(again.past_due_since).toBe(since);
    const recovered = mapSubscription(sub({ status: "active" }), row({ status: "past_due", past_due_since: since }), NOW, ENV)!;
    expect(recovered.past_due_since).toBeNull();
  });

  test("cancel_at_period_end sa prenáša", () => {
    expect(mapSubscription(sub({ cancel_at_period_end: true }), row(), NOW, ENV)!.cancel_at_period_end).toBe(true);
    expect(mapSubscription(sub({ cancel_at: 1_800_000_000 }), row(), NOW, ENV)!.cancel_at_period_end).toBe(true);
  });

  test("incomplete neprepíše platnú skúšku; incomplete_expired nič nemení", () => {
    const inc = mapSubscription(sub({ status: "incomplete" }), row({ status: "app_trial" }), NOW, ENV)!;
    expect(inc.status).toBeUndefined();
    expect(inc.stripe_subscription_id).toBe("sub_1");
    expect(mapSubscription(sub({ status: "incomplete_expired" }), row({ status: "app_trial" }), NOW, ENV)).toBeNull();
  });

  test("komped účet si ponechá tarifu aj pri platbe", () => {
    const patch = mapSubscription(sub(), row({ comped: true, tier: "business" }), NOW, ENV)!;
    expect(patch.tier).toBeUndefined();
  });

  test("neznámy stav sa ignoruje", () => {
    expect(mapSubscription(sub({ status: "weird" }), row(), NOW, ENV)).toBeNull();
  });

  test("ID predplatného z faktúry (staré aj nové API)", () => {
    expect(invoiceSubscriptionId({ subscription: "sub_a" })).toBe("sub_a");
    expect(invoiceSubscriptionId({ parent: { subscription_details: { subscription: "sub_b" } } })).toBe("sub_b");
    expect(invoiceSubscriptionId({ subscription: null })).toBeNull();
  });
});

// ---------- webhook: udalosť → stav ----------

class FakeStore implements BillingStore {
  rows = new Map<string, SubscriptionRow>();
  saves: { trainerId: string; patch: SubscriptionPatch }[] = [];
  constructor(initial: SubscriptionRow[]) {
    for (const r of initial) this.rows.set(r.trainer_id, r);
  }
  async getByTrainer(id: string) {
    return this.rows.get(id) ?? null;
  }
  async getByCustomer(id: string) {
    return [...this.rows.values()].find((r) => r.stripe_customer_id === id) ?? null;
  }
  async save(trainerId: string, patch: SubscriptionPatch) {
    const cur = this.rows.get(trainerId);
    if (!cur) throw new Error("FK: trainer neexistuje");
    this.rows.set(trainerId, { ...cur, ...patch });
    this.saves.push({ trainerId, patch });
  }
}

class FakeLog implements EventLog {
  state = new Map<string, "processing" | "done">();
  async claim(id: string) {
    const s = this.state.get(id);
    if (s === "done") return "duplicate" as const;
    if (s === "processing") return "busy" as const;
    this.state.set(id, "processing");
    return "new" as const;
  }
  async markDone(id: string) {
    this.state.set(id, "done");
  }
  async release(id: string) {
    this.state.delete(id);
  }
}

function makeDeps(store: FakeStore, subs: Record<string, Stripe.Subscription>, log = new FakeLog()): WebhookDeps & { log: FakeLog } {
  return {
    store,
    log,
    priceEnv: ENV,
    now: () => NOW,
    async retrieveSubscription(id) {
      const s = subs[id];
      if (!s) throw Object.assign(new Error("No such subscription"), { code: "resource_missing" });
      return s;
    },
  };
}

function evt(type: string, object: unknown, id = `evt_${Math.random().toString(36).slice(2)}`): Stripe.Event {
  return { id, type, object: "event", data: { object } } as unknown as Stripe.Event;
}

test.describe("webhook → stav v DB", () => {
  test("checkout.session.completed prepojí zákazníka a aktivuje tarifu z predplatného", async () => {
    const store = new FakeStore([row()]);
    const deps = makeDeps(store, { sub_1: sub() });
    const res = await processStripeEvent(
      evt("checkout.session.completed", { mode: "subscription", client_reference_id: TRAINER, customer: "cus_1", subscription: "sub_1" }),
      deps,
    );
    expect(res.outcome).toBe("processed");
    const r = store.rows.get(TRAINER)!;
    expect(r.stripe_customer_id).toBe("cus_1");
    expect(r.stripe_subscription_id).toBe("sub_1");
    expect(r.status).toBe("active");
    expect(r.tier).toBe("pro");
    expect(computeBilling(r, 5, NOW).features.aiCoach).toBe(true);
  });

  test("tarifu nemožno podvrhnúť metadátami — rozhoduje cenové ID", async () => {
    const store = new FakeStore([row({ stripe_customer_id: "cus_1" })]);
    const forged = sub({ metadata: { trainer_id: TRAINER, tier: "business" }, items: { data: [{ price: { id: "price_s" }, current_period_end: 1_800_000_000 }] } });
    await processStripeEvent(evt("customer.subscription.created", forged), makeDeps(store, { sub_1: forged }));
    expect(store.rows.get(TRAINER)!.tier).toBe("starter");
  });

  test("customer.subscription.updated: downgrade pro → starter a zrušenie ku koncu obdobia", async () => {
    const store = new FakeStore([row({ status: "active", tier: "pro", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1" })]);
    const next = sub({ cancel_at_period_end: true, items: { data: [{ price: { id: "price_s" }, current_period_end: 1_800_000_000 }] } });
    await processStripeEvent(evt("customer.subscription.updated", next), makeDeps(store, { sub_1: next }));
    const r = store.rows.get(TRAINER)!;
    expect(r.tier).toBe("starter");
    expect(r.cancel_at_period_end).toBe(true);
    expect(r.status).toBe("active");
  });

  test("customer.subscription.deleted → canceled → read-only; pri chýbajúcom objekte sa použije payload", async () => {
    const store = new FakeStore([row({ status: "active", tier: "pro", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1" })]);
    const gone = sub({ status: "canceled" });
    await processStripeEvent(evt("customer.subscription.deleted", gone), makeDeps(store, {})); // retrieve → resource_missing
    const r = store.rows.get(TRAINER)!;
    expect(r.status).toBe("canceled");
    expect(computeBilling(r, 1, NOW).readOnly).toBe(true);
  });

  test("invoice.payment_failed → past_due so zárodkom odkladu; invoice.paid ho vráti na active", async () => {
    const store = new FakeStore([row({ status: "active", tier: "pro", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1" })]);
    const subs = { sub_1: sub({ status: "past_due" }) };
    const deps = makeDeps(store, subs);
    await processStripeEvent(evt("invoice.payment_failed", { parent: { subscription_details: { subscription: "sub_1" } } }), deps);
    let r = store.rows.get(TRAINER)!;
    expect(r.status).toBe("past_due");
    expect(r.past_due_since).toBe(NOW.toISOString());
    expect(computeBilling(r, 1, NOW).readOnly).toBe(false);

    subs.sub_1 = sub({ status: "active" });
    await processStripeEvent(evt("invoice.paid", { subscription: "sub_1" }), deps);
    r = store.rows.get(TRAINER)!;
    expect(r.status).toBe("active");
    expect(r.past_due_since).toBeNull();
  });

  test("idempotencia: ten istý event sa spracuje len raz", async () => {
    const store = new FakeStore([row({ stripe_customer_id: "cus_1" })]);
    const deps = makeDeps(store, { sub_1: sub() });
    const e = evt("customer.subscription.updated", sub(), "evt_same");
    expect((await processStripeEvent(e, deps)).outcome).toBe("processed");
    const saves = store.saves.length;
    expect((await processStripeEvent(e, deps)).outcome).toBe("duplicate");
    expect(store.saves.length).toBe(saves);
  });

  test("chyba pri spracovaní uvoľní event, aby ho Stripe doručil znova", async () => {
    const store = new FakeStore([row({ stripe_customer_id: "cus_1" })]);
    const deps = makeDeps(store, {});
    deps.retrieveSubscription = async () => {
      throw new Error("Stripe výpadok");
    };
    const e = evt("invoice.paid", { subscription: "sub_1" }, "evt_retry");
    await expect(processStripeEvent(e, deps)).rejects.toThrow("Stripe výpadok");
    expect(deps.log.state.has("evt_retry")).toBe(false);
  });

  test("udalosť staršieho predplatného neprepíše živé aktuálne", async () => {
    const store = new FakeStore([row({ status: "active", tier: "pro", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_new" })]);
    const old = sub({ id: "sub_old", status: "canceled" });
    const res = await processStripeEvent(evt("customer.subscription.deleted", old), makeDeps(store, { sub_old: old }));
    expect(res).toMatchObject({ outcome: "ignored", detail: "other_subscription" });
    expect(store.rows.get(TRAINER)!.status).toBe("active");
  });

  test("cudzí zákazník alebo neznámy tréner sa ignoruje (200, nič sa nezapíše)", async () => {
    const store = new FakeStore([row({ stripe_customer_id: "cus_1" })]);
    const mismatch = sub({ metadata: { trainer_id: OTHER_TRAINER }, customer: "cus_1" });
    expect((await processStripeEvent(evt("customer.subscription.updated", mismatch), makeDeps(store, { sub_1: mismatch }))).outcome).toBe("ignored");
    const stranger = sub({ metadata: { trainer_id: OTHER_TRAINER }, customer: "cus_other" });
    expect((await processStripeEvent(evt("customer.subscription.updated", stranger), makeDeps(store, { sub_1: stranger }))).outcome).toBe("ignored");
    expect(store.saves.length).toBe(0);
  });

  test("nepodporované udalosti sa potvrdia bez zmeny", async () => {
    const store = new FakeStore([row()]);
    const res = await processStripeEvent(evt("charge.refunded", {}), makeDeps(store, {}));
    expect(res.outcome).toBe("ignored");
    expect(store.saves.length).toBe(0);
  });
});

test.describe("podpis webhooku", () => {
  const stripe = new Stripe("sk_test_dummy_for_signature_tests");
  const secret = "whsec_test_secret";
  const payload = JSON.stringify({ id: "evt_sig", object: "event", type: "invoice.paid", data: { object: {} } });

  test("platný podpis prejde, upravené telo alebo zlý secret zlyhá", () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(stripe.webhooks.constructEvent(payload, header, secret).id).toBe("evt_sig");
    expect(() => stripe.webhooks.constructEvent(payload + " ", header, secret)).toThrow();
    expect(() => stripe.webhooks.constructEvent(payload, header, "whsec_other")).toThrow();
    expect(() => stripe.webhooks.constructEvent(payload, "t=1,v1=deadbeef", secret)).toThrow();
  });
});
