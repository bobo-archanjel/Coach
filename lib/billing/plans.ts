// FitPilot — tarify a oprávnenia (feature/Stripe). JEDNO miesto pravdy pre to, čo ktorá
// tarifa obsahuje. Čistý modul (žiadne importy z Next/Supabase), preto sa dá testovať
// samostatne (e2e/billing.spec.ts).
//
// Model: TARIFA (starter / pro / business) určuje funkcie, VARIANT (starter5 / starter10 /
// pro / business) určuje limit aktívnych klientov. Limit sa ukladá per tréner
// (trainer_subscriptions.client_limit, migrácia 0074) — nastavuje ho webhook z ceny.
// Predvolené limity tarify (TIER_DEFAULT_LIMIT) drží aj SQL billing_client_limit — pri zmene
// upraviť OBE miesta.

export const TIERS = ["starter", "pro", "business"] as const;
export type Tier = (typeof TIERS)[number];

/** Funkcie, ktoré sa dajú zamknúť podľa tarify. */
export const FEATURES = [
  "aiCoach", // AI Kouč (chat) pre klientov trénera
  "aiPlanGenerator", // AI generátor tréningových plánov
  "aiMealGenerator", // AI generátor jedálničkov
  "aiSummaries", // AI zhrnutia (progres klienta, týždenný digest portfólia)
  "advancedReports", // pokročilé reporty (funkcia príde pred spustením — viď docs/billing)
  "branding", // vlastný branding (funkcia príde pred spustením, zatiaľ len príznak)
  "challenges", // výzvy trénera pre klientov (gamifikácia, fáza B)
  "leaderboard", // rebríček klientov jedného trénera (gamifikácia, fáza B)
] as const;
export type Feature = (typeof FEATURES)[number];

export type FeatureFlags = Record<Feature, boolean>;

export interface PlanDef {
  tier: Tier;
  features: FeatureFlags;
}

const NO_FEATURES: FeatureFlags = {
  aiCoach: false,
  aiPlanGenerator: false,
  aiMealGenerator: false,
  aiSummaries: false,
  advancedReports: false,
  branding: false,
  challenges: false,
  leaderboard: false,
};

const PRO_FEATURES: FeatureFlags = {
  ...NO_FEATURES,
  challenges: true,
  leaderboard: true,
  aiCoach: true,
  aiPlanGenerator: true,
  aiMealGenerator: true,
  aiSummaries: true,
  advancedReports: true,
};

export const PLANS: Record<Tier, PlanDef> = {
  starter: { tier: "starter", features: NO_FEATURES },
  pro: { tier: "pro", features: PRO_FEATURES },
  business: { tier: "business", features: { ...PRO_FEATURES, branding: true } },
};

/** Predvolený limit aktívnych klientov tarify (null = bez limitu), keď riadok nemá vlastný client_limit. */
export const TIER_DEFAULT_LIMIT: Record<Tier, number | null> = {
  starter: 10,
  pro: 30,
  business: null,
};

/** Limit klientov skúšobnej doby (tarifa Starter, väčší variant). */
export const TRIAL_CLIENT_LIMIT = 10;

/**
 * Limit aktívnych klientov pre tarifu: uložený client_limit, inak predvolený limit tarify.
 * (Business s null = bez limitu; chýbajúca hodnota u Starter/Pro nikdy neznamená „bez limitu“.)
 */
export function clientLimitFor(tier: Tier, stored: number | null | undefined): number | null {
  return typeof stored === "number" ? stored : TIER_DEFAULT_LIMIT[tier];
}

/** Nižšia tarifa, ktorá funkciu obsahuje (pre text „dostupné od tarify …“). */
export function minTierFor(feature: Feature): Tier {
  return TIERS.find((t) => PLANS[t].features[feature]) ?? "business";
}

export function isTier(value: unknown): value is Tier {
  return typeof value === "string" && (TIERS as readonly string[]).includes(value);
}

// ---------- varianty (to, čo si tréner kupuje) ----------

export const VARIANTS = ["starter5", "starter10", "pro", "business"] as const;
export type Variant = (typeof VARIANTS)[number];

export interface Plan {
  variant: Variant;
  tier: Tier;
  /** max. aktívnych klientov; null = bez limitu */
  clientLimit: number | null;
}

export const VARIANT_PLANS: Record<Variant, Plan> = {
  starter5: { variant: "starter5", tier: "starter", clientLimit: 5 },
  starter10: { variant: "starter10", tier: "starter", clientLimit: 10 },
  pro: { variant: "pro", tier: "pro", clientLimit: 30 },
  business: { variant: "business", tier: "business", clientLimit: null },
};

export function isVariant(value: unknown): value is Variant {
  return typeof value === "string" && (VARIANTS as readonly string[]).includes(value);
}

// ---------- mapovanie Stripe cenových ID ↔ variant (server; dáta zo Stripe, nikdy od klienta) ----------

export type PriceEnv = Partial<
  Record<
    | "STRIPE_PRICE_STARTER_5"
    | "STRIPE_PRICE_STARTER_10"
    | "STRIPE_PRICE_PRO"
    | "STRIPE_PRICE_BUSINESS"
    // staršia premenná (jediná cena Starter) — spätná kompatibilita, berie sa ako Starter 10
    | "STRIPE_PRICE_STARTER",
    string | undefined
  >
>;

const PRICE_ENV_KEY: Record<Variant, keyof PriceEnv> = {
  starter5: "STRIPE_PRICE_STARTER_5",
  starter10: "STRIPE_PRICE_STARTER_10",
  pro: "STRIPE_PRICE_PRO",
  business: "STRIPE_PRICE_BUSINESS",
};

/** lookup_key cien v Stripe (scripts/stripe-setup.mjs) → variant; zahŕňa aj staršie (archivované) ceny. */
export const LOOKUP_KEY_VARIANT: Record<string, Variant> = {
  fitpilot_starter5_monthly_eur: "starter5",
  fitpilot_starter10_monthly_eur: "starter10",
  fitpilot_pro30_monthly_eur: "pro",
  fitpilot_business_monthly_eur: "business",
  // staršie ceny (pred rozdelením Starter na 5/10 a zmenou Pro na 30 klientov)
  fitpilot_starter_monthly_eur: "starter10",
  fitpilot_pro_monthly_eur: "pro",
};

/** Minimálny tvar objektu Price zo Stripe, z ktorého sa určuje variant. */
export interface PriceLike {
  id?: string | null;
  lookup_key?: string | null;
  metadata?: Record<string, string> | null;
}

export function priceIdForVariant(variant: Variant, env: PriceEnv = process.env as PriceEnv): string | null {
  return env[PRICE_ENV_KEY[variant]]?.trim() || null;
}

/**
 * Cena zo Stripe → variant. Poradie: ID z env (autoritatívne), staršia STRIPE_PRICE_STARTER (= Starter 10),
 * potom lookup_key a metadata.variant samotnej ceny (vytvára ich len náš setup skript v NAŠOM účte;
 * metadáta predplatného ani Checkoutu sa sem nikdy nedostanú).
 */
export function planForPrice(price: PriceLike | string | null | undefined, env: PriceEnv = process.env as PriceEnv): Plan | null {
  if (!price) return null;
  const p: PriceLike = typeof price === "string" ? { id: price } : price;
  const id = p.id?.trim();
  if (id) {
    const byEnv = VARIANTS.find((v) => priceIdForVariant(v, env) === id);
    if (byEnv) return VARIANT_PLANS[byEnv];
    if (env.STRIPE_PRICE_STARTER?.trim() === id) return VARIANT_PLANS.starter10;
  }
  const lk = p.lookup_key ? LOOKUP_KEY_VARIANT[p.lookup_key] : undefined;
  if (lk) return VARIANT_PLANS[lk];
  const mv = p.metadata?.variant;
  if (isVariant(mv)) return VARIANT_PLANS[mv];
  return null;
}
