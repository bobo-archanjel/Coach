// FitPilot — tarify a oprávnenia (feature/Stripe). JEDNO miesto pravdy pre to, čo ktorá
// tarifa obsahuje. Čistý modul (žiadne importy z Next/Supabase), preto sa dá testovať
// samostatne (e2e/billing.spec.ts). Rovnaké limity drží SQL v migrácii 0073
// (billing_client_limit) — pri zmene upraviť OBE miesta.

export const TIERS = ["starter", "pro", "business"] as const;
export type Tier = (typeof TIERS)[number];

/** Funkcie, ktoré sa dajú zamknúť podľa tarify. */
export const FEATURES = [
  "aiCoach", // AI Kouč (chat) pre klientov trénera
  "aiPlanGenerator", // AI generátor tréningových plánov
  "aiMealGenerator", // AI generátor jedálničkov
  "aiSummaries", // AI zhrnutia (progres klienta, týždenný digest portfólia)
  "advancedReports", // pokročilé reporty (zatiaľ žiadna samostatná funkcia — viď docs/billing)
  "branding", // vlastný branding (funkcia príde neskôr, zatiaľ len príznak)
] as const;
export type Feature = (typeof FEATURES)[number];

export type FeatureFlags = Record<Feature, boolean>;

export interface PlanDef {
  tier: Tier;
  /** max. aktívnych klientov; null = bez limitu */
  maxClients: number | null;
  features: FeatureFlags;
}

const NO_FEATURES: FeatureFlags = {
  aiCoach: false,
  aiPlanGenerator: false,
  aiMealGenerator: false,
  aiSummaries: false,
  advancedReports: false,
  branding: false,
};

const PRO_FEATURES: FeatureFlags = {
  ...NO_FEATURES,
  aiCoach: true,
  aiPlanGenerator: true,
  aiMealGenerator: true,
  aiSummaries: true,
};

export const PLANS: Record<Tier, PlanDef> = {
  starter: { tier: "starter", maxClients: 10, features: NO_FEATURES },
  pro: { tier: "pro", maxClients: 50, features: PRO_FEATURES },
  business: {
    tier: "business",
    maxClients: null,
    features: { ...PRO_FEATURES, advancedReports: true, branding: true },
  },
};

/** Nižšia tarifa, ktorá funkciu obsahuje (pre text „dostupné od tarify …“). */
export function minTierFor(feature: Feature): Tier {
  return TIERS.find((t) => PLANS[t].features[feature]) ?? "business";
}

export function isTier(value: unknown): value is Tier {
  return typeof value === "string" && (TIERS as readonly string[]).includes(value);
}

// ---------- mapovanie Stripe cenových ID ↔ tarifa (server; ID z env, nikdy od klienta) ----------

export type PriceEnv = Partial<
  Record<"STRIPE_PRICE_STARTER" | "STRIPE_PRICE_PRO" | "STRIPE_PRICE_BUSINESS", string | undefined>
>;

const PRICE_ENV_KEY: Record<Tier, keyof PriceEnv> = {
  starter: "STRIPE_PRICE_STARTER",
  pro: "STRIPE_PRICE_PRO",
  business: "STRIPE_PRICE_BUSINESS",
};

export function priceIdForTier(tier: Tier, env: PriceEnv = process.env as PriceEnv): string | null {
  return env[PRICE_ENV_KEY[tier]]?.trim() || null;
}

export function tierForPriceId(priceId: string | null | undefined, env: PriceEnv = process.env as PriceEnv): Tier | null {
  if (!priceId) return null;
  return TIERS.find((t) => priceIdForTier(t, env) === priceId) ?? null;
}
