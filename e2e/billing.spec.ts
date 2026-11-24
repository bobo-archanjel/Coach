// i18n-ignore-file: testy predplatného (feature/Stripe) — čisté testy bez siete a bez DB
import { test, expect } from "@playwright/test";
import Stripe from "stripe";
import { PLANS, TRIAL_CLIENT_LIMIT, VARIANT_PLANS, clientLimitFor, minTierFor, planForPrice, priceIdForVariant } from "../lib/billing/plans";
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
  scheduledChangeFromSchedule,
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

const ENV = {
  STRIPE_PRICE_STARTER_5: "price_s5",
  STRIPE_PRICE_STARTER_10: "price_s10",
  STRIPE_PRICE_PRO: "price_p",
  STRIPE_PRICE_BUSINESS: "price_b",
};

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
    client_limit: 10,
    scheduled_tier: null,
    scheduled_client_limit: null,
    scheduled_change_at: null,
    ...over,
  };
}

test.describe("tarify a ceny", () => {
  test("limity klientov podľa variantu a funkcie podľa tarify", () => {
    expect(VARIANT_PLANS.starter5.clientLimit).toBe(5);
    expect(VARIANT_PLANS.starter10.clientLimit).toBe(10);
    expect(VARIANT_PLANS.pro.clientLimit).toBe(30);
    expect(VARIANT_PLANS.business.clientLimit).toBeNull();
    expect(TRIAL_CLIENT_LIMIT).toBe(10);
    // chýbajúci uložený limit nikdy neznamená „bez limitu“ pre Starter/Pro
    expect(clientLimitFor("starter", null)).toBe(10);
    expect(clientLimitFor("pro", null)).toBe(30);
    expect(clientLimitFor("business", null)).toBeNull();
    expect(clientLimitFor("starter", 5)).toBe(5);
    expect(PLANS.starter.features.aiCoach).toBe(false);
    for (const f of ["aiCoach", "aiPlanGenerator", "aiMealGenerator", "aiSummaries"] as const) {
      expect(PLANS.pro.features[f]).toBe(true);
      expect(PLANS.business.features[f]).toBe(true);
    }
    expect(PLANS.pro.features.advancedReports).toBe(true);
    expect(PLANS.starter.features.advancedReports).toBe(false);
    expect(PLANS.business.features.advancedReports).toBe(true);
    expect(PLANS.business.features.branding).toBe(true);
    expect(PLANS.pro.features.branding).toBe(false);
    expect(minTierFor("aiCoach")).toBe("pro");
    expect(minTierFor("branding")).toBe("business");
  });

  test("cena ↔ variant (tarifa + limit) sa určuje na serveri z env", () => {
    expect(priceIdForVariant("pro", ENV)).toBe("price_p");
    expect(planForPrice("price_b", ENV)).toMatchObject({ tier: "business", clientLimit: null });
    expect(planForPrice("price_s5", ENV)).toMatchObject({ tier: "starter", clientLimit: 5 });
    expect(planForPrice("price_s10", ENV)).toMatchObject({ tier: "starter", clientLimit: 10 });
    expect(planForPrice("price_p", ENV)).toMatchObject({ tier: "pro", clientLimit: 30 });
    expect(planForPrice("price_unknown", ENV)).toBeNull();
    expect(planForPrice(null, ENV)).toBeNull();
    // nenastavená env premenná nesmie zhodnúť prázdne ID s tarifou
    expect(planForPrice("", {})).toBeNull();
    expect(priceIdForVariant("starter5", {})).toBeNull();
  });

  test("staršie ceny: STRIPE_PRICE_STARTER = Starter 10, lookup_key archivovaných cien, metadata ceny", () => {
    expect(planForPrice("price_old_starter", { STRIPE_PRICE_STARTER: "price_old_starter" })).toMatchObject({ tier: "starter", clientLimit: 10 });
    expect(planForPrice({ id: "price_x", lookup_key: "fitpilot_starter_monthly_eur" }, ENV)).toMatchObject({ tier: "starter", clientLimit: 10 });
    expect(planForPrice({ id: "price_y", lookup_key: "fitpilot_pro_monthly_eur" }, ENV)).toMatchObject({ tier: "pro", clientLimit: 30 });
    expect(planForPrice({ id: "price_z", lookup_key: "fitpilot_pro30_monthly_eur" }, ENV)).toMatchObject({ tier: "pro" });
    expect(planForPrice({ id: "price_m", metadata: { variant: "starter5" } }, ENV)).toMatchObject({ tier: "starter", clientLimit: 5 });
    // samotné metadata.tier (bez variantu) ani cudzí lookup_key tarifu nepridelí
    expect(planForPrice({ id: "price_n2", lookup_key: "cudzi_kluc", metadata: { tier: "business" } }, ENV)).toBeNull();
  });
});

test.describe("read-only a oprávnenia", () => {
  test("nový tréner: skúška starter, 14 dní, bez AI", () => {
    const s = computeBilling(row({ trial_ends_at: iso(14) }), 3, NOW);
    expect(s.readOnly).toBe(false);
    expect(s.accessTier).toBe("starter");
    expect(s.trialDaysLeft).toBe(14);
    expect(s.features.advancedReports).toBe(false);
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
    const s = computeBilling(row({ comped: true, tier: "business", status: "canceled", trial_ends_at: null, client_limit: null }), 500, NOW);
    expect(s.readOnly).toBe(false);
    expect(s.accessTier).toBe("business");
    expect(s.clientLimit).toBeNull();
    expect(s.features.branding).toBe(true);
    expect(s.trialDaysLeft).toBeNull();
  });

  test("aktívne predplatné pro odomkne AI, zrušené/nezaplatené je read-only", () => {
    const active = computeBilling(row({ status: "active", tier: "pro", client_limit: 30 }), 20, NOW);
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

  test("limit klientov 5 / 10 / 30 / bez limitu z uloženého client_limit", () => {
    const s5 = row({ status: "active", tier: "starter", client_limit: 5 });
    expect(computeBilling(s5, 5, NOW)).toMatchObject({ clientLimit: 5, readOnly: false, canAddClient: false });
    expect(computeBilling(s5, 4, NOW).canAddClient).toBe(true);
    expect(computeBilling(s5, 6, NOW)).toMatchObject({ readOnly: true, reason: "over_limit" });
    const s10 = row({ status: "active", tier: "starter", client_limit: 10 });
    expect(computeBilling(s10, 9, NOW).canAddClient).toBe(true);
    expect(computeBilling(s10, 11, NOW).reason).toBe("over_limit");
    const pro = row({ status: "active", tier: "pro", client_limit: 30 });
    expect(computeBilling(pro, 30, NOW)).toMatchObject({ clientLimit: 30, readOnly: false, canAddClient: false });
    expect(computeBilling(pro, 31, NOW).reason).toBe("over_limit");
    const biz = row({ status: "active", tier: "business", client_limit: null });
    expect(computeBilling(biz, 5000, NOW)).toMatchObject({ clientLimit: null, readOnly: false, canAddClient: true });
    // skúška: limit 10
    expect(computeBilling(row({ client_limit: TRIAL_CLIENT_LIMIT }), 10, NOW).canAddClient).toBe(false);
    // riadok bez uloženého limitu (null) u Pro/Starter sa nikdy nestane „bez limitu“
    expect(computeBilling(row({ status: "active", tier: "pro", client_limit: null }), 31, NOW).reason).toBe("over_limit");
    expect(computeBilling(row({ status: "active", tier: "starter", client_limit: null }), 11, NOW).reason).toBe("over_limit");
  });

  test("naplánovaný downgrade: do konca obdobia platí pôvodná tarifa a limit, varovanie pri nadlimite", () => {
    const base = {
      status: "active" as const,
      tier: "pro" as const,
      client_limit: 30,
      scheduled_tier: "starter" as const,
      scheduled_client_limit: 10,
      scheduled_change_at: iso(20),
      current_period_end: iso(20),
    };
    const ok = computeBilling(row(base), 8, NOW);
    expect(ok.accessTier).toBe("pro");
    expect(ok.readOnly).toBe(false);
    expect(ok.features.aiCoach).toBe(true);
    expect(ok.clientLimit).toBe(30);
    expect(ok.scheduledChange).toEqual({ tier: "starter", clientLimit: 10, at: iso(20), overLimit: false });
    // 25 klientov: pred prechodom ešte nie je read-only, ale varovanie áno
    const over = computeBilling(row(base), 25, NOW);
    expect(over.readOnly).toBe(false);
    expect(over.scheduledChange?.overLimit).toBe(true);
    // po prechode (webhook už zapísal Starter 10 a zmazal plán) je to read-only over_limit
    const after = computeBilling(row({ ...base, tier: "starter", client_limit: 10, scheduled_tier: null, scheduled_client_limit: null, scheduled_change_at: null }), 25, NOW);
    expect(after.readOnly).toBe(true);
    expect(after.reason).toBe("over_limit");
    expect(after.scheduledChange).toBeNull();
    // zrušenie ku koncu obdobia, komped a minulá zmena žiadnu naplánovanú zmenu nezobrazia
    expect(computeBilling(row({ ...base, cancel_at_period_end: true }), 8, NOW).scheduledChange).toBeNull();
    expect(computeBilling(row({ ...base, comped: true }), 8, NOW).scheduledChange).toBeNull();
    expect(computeBilling(row({ ...base, scheduled_change_at: iso(-1) }), 8, NOW).scheduledChange).toBeNull();
    // Business → Pro: bez limitu → 30 a nadlimit sa počíta
    const biz = computeBilling(row({ ...base, tier: "business", client_limit: null, scheduled_tier: "pro", scheduled_client_limit: 30 }), 31, NOW);
    expect(biz.scheduledChange).toMatchObject({ tier: "pro", clientLimit: 30, overLimit: true });
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

/** Subscription schedule: fáza 1 (Pro, už beží) a fáza 2 (Starter 10) od 1_800_000_000. */
function schedule(over: { nextPrice?: unknown; nextStart?: number; status?: string } = {}): Stripe.SubscriptionSchedule {
  return {
    id: "sub_sched_1",
    object: "subscription_schedule",
    status: over.status ?? "active",
    subscription: "sub_1",
    phases: [
      { start_date: 1_700_000_000, end_date: over.nextStart ?? 1_800_000_000, items: [{ price: "price_p", quantity: 1 }] },
      { start_date: over.nextStart ?? 1_800_000_000, items: [{ price: over.nextPrice ?? "price_s10", quantity: 1 }] },
    ],
  } as unknown as Stripe.SubscriptionSchedule;
}

test.describe("mapSubscription", () => {
  test("tarifa sa určí z cenového ID, obdobie z položky predplatného", () => {
    const patch = mapSubscription(sub(), row(), NOW, ENV)!;
    expect(patch.tier).toBe("pro");
    expect(patch.client_limit).toBe(30);
    expect(patch.status).toBe("active");
    expect(patch.stripe_customer_id).toBe("cus_1");
    expect(patch.current_period_end).toBe(new Date(1_800_000_000 * 1000).toISOString());
    expect(patch.past_due_since).toBeNull();
  });

  test("staršie API: current_period_end na predplatnom", () => {
    const old = sub({ items: { data: [{ price: { id: "price_s10" } }] }, current_period_end: 1_700_000_000 });
    expect(mapSubscription(old, row(), NOW, ENV)!.current_period_end).toBe(new Date(1_700_000_000 * 1000).toISOString());
  });

  test("neznáme cenové ID nezmení tarifu ani limit", () => {
    const patch = mapSubscription(sub({ items: { data: [{ price: { id: "price_x" } }] } }), row({ tier: "pro" }), NOW, ENV)!;
    expect(patch.tier).toBeUndefined();
    expect(patch.client_limit).toBeUndefined();
  });

  test("Starter 5 / Starter 10 / Business nastavia limit; staršia cena podľa lookup_key sa namapuje", () => {
    const pick = (price: Record<string, unknown>) => mapSubscription(sub({ items: { data: [{ price, current_period_end: 1_800_000_000 }] } }), row(), NOW, ENV)!;
    expect(pick({ id: "price_s5" })).toMatchObject({ tier: "starter", client_limit: 5 });
    expect(pick({ id: "price_s10" })).toMatchObject({ tier: "starter", client_limit: 10 });
    expect(pick({ id: "price_b" })).toMatchObject({ tier: "business", client_limit: null });
    expect(pick({ id: "price_old49", lookup_key: "fitpilot_pro_monthly_eur" })).toMatchObject({ tier: "pro", client_limit: 30 });
    expect(pick({ id: "price_old19", lookup_key: "fitpilot_starter_monthly_eur" })).toMatchObject({ tier: "starter", client_limit: 10 });
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
    const patch = mapSubscription(sub(), row({ comped: true, tier: "business", client_limit: null }), NOW, ENV)!;
    expect(patch.tier).toBeUndefined();
    expect(patch.client_limit).toBeUndefined();
    expect(patch.scheduled_tier).toBeNull();
  });

  test("neznámy stav sa ignoruje", () => {
    expect(mapSubscription(sub({ status: "weird" }), row(), NOW, ENV)).toBeNull();
  });

  test("naplánovaný downgrade zo schedule sa uloží, aktuálna tarifa ostáva Pro", () => {
    const patch = mapSubscription(sub({ schedule: "sub_sched_1" }), row({ status: "active", tier: "pro", client_limit: 30 }), NOW, ENV, schedule())!;
    expect(patch.tier).toBe("pro");
    expect(patch.client_limit).toBe(30);
    expect(patch.scheduled_tier).toBe("starter");
    expect(patch.scheduled_client_limit).toBe(10);
    expect(patch.scheduled_change_at).toBe(new Date(1_800_000_000 * 1000).toISOString());
  });

  test("bez schedule alebo pri zrušení ku koncu obdobia sa naplánovaná zmena vymaže", () => {
    const none = mapSubscription(sub(), row({ scheduled_tier: "starter", scheduled_change_at: iso(5) }), NOW, ENV, null)!;
    expect(none.scheduled_tier).toBeNull();
    expect(none.scheduled_change_at).toBeNull();
    const canceling = mapSubscription(sub({ cancel_at_period_end: true }), row(), NOW, ENV, schedule())!;
    expect(canceling.scheduled_tier).toBeNull();
    const canceled = mapSubscription(sub({ status: "canceled" }), row(), NOW, ENV, schedule())!;
    expect(canceled.scheduled_tier).toBeNull();
  });

  test("scheduledChangeFromSchedule: budúca fáza s inou cenou; rovnaká cena, minulé a nenamapovateľné fázy nie", () => {
    const cur = VARIANT_PLANS.pro;
    expect(scheduledChangeFromSchedule(schedule(), cur, NOW, ENV)?.plan.variant).toBe("starter10");
    // cena fázy ako rozbalený objekt s lookup_key
    const expanded = schedule({ nextPrice: { id: "price_zzz", lookup_key: "fitpilot_starter5_monthly_eur" } });
    expect(scheduledChangeFromSchedule(expanded, cur, NOW, ENV)?.plan.variant).toBe("starter5");
    expect(scheduledChangeFromSchedule(schedule({ nextPrice: "price_p" }), cur, NOW, ENV)).toBeNull();
    expect(scheduledChangeFromSchedule(schedule({ nextPrice: "price_unknown" }), cur, NOW, ENV)).toBeNull();
    expect(scheduledChangeFromSchedule(schedule({ nextStart: Math.floor(NOW.getTime() / 1000) - 10 }), cur, NOW, ENV)).toBeNull();
    expect(scheduledChangeFromSchedule(schedule({ status: "released" }), cur, NOW, ENV)).toBeNull();
    expect(scheduledChangeFromSchedule(null, cur, NOW, ENV)).toBeNull();
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

function makeDeps(
  store: FakeStore,
  subs: Record<string, Stripe.Subscription>,
  log = new FakeLog(),
  schedules: Record<string, Stripe.SubscriptionSchedule> = {},
): WebhookDeps & { log: FakeLog } {
  return {
    store,
    log,
    priceEnv: ENV,
    now: () => NOW,
    async retrieveSchedule(id) {
      const sc = schedules[id];
      if (!sc) throw Object.assign(new Error("No such schedule"), { code: "resource_missing" });
      return sc;
    },
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
    const forged = sub({ metadata: { trainer_id: TRAINER, tier: "business" }, items: { data: [{ price: { id: "price_s10" }, current_period_end: 1_800_000_000 }] } });
    await processStripeEvent(evt("customer.subscription.created", forged), makeDeps(store, { sub_1: forged }));
    expect(store.rows.get(TRAINER)!.tier).toBe("starter");
  });

  test("customer.subscription.updated: downgrade pro → starter a zrušenie ku koncu obdobia", async () => {
    const store = new FakeStore([row({ status: "active", tier: "pro", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1" })]);
    const next = sub({ cancel_at_period_end: true, items: { data: [{ price: { id: "price_s10" }, current_period_end: 1_800_000_000 }] } });
    await processStripeEvent(evt("customer.subscription.updated", next), makeDeps(store, { sub_1: next }));
    const r = store.rows.get(TRAINER)!;
    expect(r.tier).toBe("starter");
    expect(r.client_limit).toBe(10);
    expect(r.cancel_at_period_end).toBe(true);
    expect(r.status).toBe("active");
  });

  test("downgrade pro → starter 10 v Portale: do konca obdobia ostáva Pro, potom sa prepne na Starter 10", async () => {
    const store = new FakeStore([row({ status: "active", tier: "pro", client_limit: 30, stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1" })]);
    const sched = { sub_sched_1: schedule() };
    // 1) Portal vytvorí schedule: sub je stále na cene Pro, má schedule
    const scheduled = sub({ schedule: "sub_sched_1" });
    const deps = makeDeps(store, { sub_1: scheduled }, new FakeLog(), sched);
    await processStripeEvent(evt("subscription_schedule.created", { id: "sub_sched_1", subscription: "sub_1" }), deps);
    let r = store.rows.get(TRAINER)!;
    expect(r.tier).toBe("pro");
    expect(r.client_limit).toBe(30);
    expect(r.scheduled_tier).toBe("starter");
    expect(r.scheduled_client_limit).toBe(10);
    expect(computeBilling(r, 25, NOW)).toMatchObject({ accessTier: "pro", readOnly: false });
    expect(computeBilling(r, 25, NOW).scheduledChange?.overLimit).toBe(true);

    // 2) customer.subscription.updated uprostred obdobia nič nezmení (stále Pro)
    await processStripeEvent(evt("customer.subscription.updated", scheduled), deps);
    r = store.rows.get(TRAINER)!;
    expect(r.tier).toBe("pro");

    // 3) koniec obdobia: Stripe prepne cenu predplatného na Starter 10 (fáza 2 beží, žiadna ďalšia fáza)
    const switched = sub({ schedule: "sub_sched_1", items: { data: [{ price: { id: "price_s10" }, current_period_end: 1_900_000_000 }] } });
    const sched2 = { sub_sched_1: schedule({ nextStart: Math.floor(NOW.getTime() / 1000) - 60 }) };
    await processStripeEvent(evt("customer.subscription.updated", switched), makeDeps(store, { sub_1: switched }, new FakeLog(), sched2));
    r = store.rows.get(TRAINER)!;
    expect(r.tier).toBe("starter");
    expect(r.client_limit).toBe(10);
    expect(r.scheduled_tier).toBeNull();
    expect(r.scheduled_change_at).toBeNull();
    expect(computeBilling(r, 25, NOW)).toMatchObject({ readOnly: true, reason: "over_limit" });
  });

  test("zrušenie / uvoľnenie schedule vymaže naplánovanú zmenu (subscription_schedule.released)", async () => {
    const store = new FakeStore([
      row({ status: "active", tier: "pro", client_limit: 30, scheduled_tier: "starter", scheduled_client_limit: 10, scheduled_change_at: iso(20), stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1" }),
    ]);
    const res = await processStripeEvent(
      evt("subscription_schedule.released", { id: "sub_sched_1", subscription: null, released_subscription: "sub_1" }),
      makeDeps(store, { sub_1: sub() }),
    );
    expect(res.outcome).toBe("processed");
    const r = store.rows.get(TRAINER)!;
    expect(r.scheduled_tier).toBeNull();
    expect(r.tier).toBe("pro");
  });

  test("zmena Starter 5 → Starter 10 (upgrade) sa prejaví hneď limitom", async () => {
    const store = new FakeStore([row({ status: "active", tier: "starter", client_limit: 5, stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1" })]);
    const up = sub({ items: { data: [{ price: { id: "price_s10" }, current_period_end: 1_800_000_000 }] } });
    await processStripeEvent(evt("customer.subscription.updated", up), makeDeps(store, { sub_1: up }));
    expect(store.rows.get(TRAINER)).toMatchObject({ tier: "starter", client_limit: 10 });
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
