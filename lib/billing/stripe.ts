import "server-only";
import Stripe from "stripe";

/**
 * Stripe klient — VÝHRADNE server (import "server-only"). Secret key nikdy nemá prefix
 * NEXT_PUBLIC_. Verzia API je pripnutá verziou balíka `stripe` (package.json je bez ^),
 * takže sa nemení potichu.
 */
let cached: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    // i18n-ignore — vývojárska chyba (chýbajúca konfigurácia servera)
    throw new Error("Stripe: chýba STRIPE_SECRET_KEY");
  }
  cached = new Stripe(key, { typescript: true, maxNetworkRetries: 2, appInfo: { name: "FitPilot" } });
  return cached;
}

/** Základ URL pre návratové adresy (Checkout/Portal) — NEXT_PUBLIC_SITE_URL, inak lokálny dev. */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  return "http://localhost:3000";
}
