"use server";

// FitPilot — fakturačné akcie trénera (feature/Stripe): Stripe Checkout a Customer Portal.
// Tieto akcie sú ZÁMERNE povolené aj v read-only režime (tréner si tak vie predplatné obnoviť).
// Z klienta nechodí žiadna cena ani limit okrem názvu varianta (starter5 / starter10 / pro / business)
// — cenové ID určuje server z env (lib/billing/plans.ts), názov sa overí proti zoznamu. Prístup tu NIE JE udelený: tarifu
// a stav nastavuje výhradne webhook (app/api/stripe/webhook/route.ts).

import { tErr } from "@/lib/i18n/serverErrors";
import { createClient, getProfile } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, isStripeConfigured, siteUrl } from "@/lib/billing/stripe";
import { isVariant, priceIdForVariant } from "@/lib/billing/plans";
import { getTrainerBilling } from "@/lib/billing/server";

export interface BillingRedirectState {
  error: string | null;
  /** adresa Stripe (Checkout / Portal), na ktorú klient presmeruje prehliadač */
  url: string | null;
}

const fail = (error: string): BillingRedirectState => ({ error, url: null });

/** Prihlásený tréner, inak chybová hláška. */
async function requireTrainer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: await tErr("notSignedIn") } as const;
  const { data: profile } = await getProfile(user.id);
  if (profile?.role !== "trainer") return { ok: false, error: await tErr("billing.trainerOnly") } as const;
  return { ok: true, supabase, user } as const;
}

async function portalUrl(customerId: string): Promise<string> {
  // konfigurácia Portalu (downgrade na konci obdobia, upgrade hneď) — scripts/stripe-setup.mjs;
  // bez STRIPE_PORTAL_CONFIGURATION sa použije predvolená konfigurácia účtu
  const configuration = process.env.STRIPE_PORTAL_CONFIGURATION?.trim();
  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    ...(configuration ? { configuration } : {}),
    return_url: `${siteUrl()}/dashboard/predplatne`,
  });
  return session.url;
}

/** Stripe zákazník pre trénera (jeden na trénera, idempotentne) — uložený v trainer_subscriptions. */
async function ensureCustomer(trainerId: string, email: string | undefined, existingId: string | null): Promise<string> {
  if (existingId) return existingId;
  const stripe = getStripe();
  const customer = await stripe.customers.create(
    { email, metadata: { trainer_id: trainerId } },
    { idempotencyKey: `fitpilot-customer-${trainerId}` },
  );
  // service role: tréner do trainer_subscriptions písať nesmie. Riadok už existuje (skúška),
  // stĺpec stripe_customer_id je unique → druhý súbežný zápis by zlyhal, nie duplikoval.
  const { error } = await createAdminClient()
    .from("trainer_subscriptions")
    .update({ stripe_customer_id: customer.id, updated_at: new Date().toISOString() })
    .eq("trainer_id", trainerId)
    .is("stripe_customer_id", null);
  if (error) throw new Error(`ensureCustomer: ${error.message}`);
  return customer.id;
}

/**
 * Založí Stripe Checkout (mode=subscription) pre zvolenú tarifu. Tréner s existujúcim živým
 * predplatným (active/trialing/past_due) ide radšej do Customer Portalu — inak by mohol
 * mať dve predplatné naraz.
 */
export async function createCheckoutSessionAction(rawVariant: string): Promise<BillingRedirectState> {
  const auth = await requireTrainer();
  if (!auth.ok) return fail(auth.error);
  if (!isVariant(rawVariant)) return fail(await tErr("billing.invalidTier"));
  if (!isStripeConfigured()) return fail(await tErr("billing.notConfigured"));

  const priceId = priceIdForVariant(rawVariant);
  if (!priceId) return fail(await tErr("billing.notConfigured"));

  try {
    const { row } = await getTrainerBilling(auth.supabase, auth.user.id);
    if (!row) return fail(await tErr("billing.checkoutFailed"));
    if (row.comped) return fail(await tErr("billing.comped"));

    if (row.stripe_customer_id && ["active", "trialing", "past_due"].includes(row.status)) {
      return { error: null, url: await portalUrl(row.stripe_customer_id) };
    }

    const customerId = await ensureCustomer(auth.user.id, auth.user.email, row.stripe_customer_id);
    const base = siteUrl();
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: auth.user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: false,
      metadata: { trainer_id: auth.user.id },
      // metadáta aj na samotnom predplatnom — udalosti customer.subscription.* tak identifikujú trénera
      subscription_data: { metadata: { trainer_id: auth.user.id } },
      success_url: `${base}/dashboard/predplatne?checkout=success`,
      cancel_url: `${base}/dashboard/predplatne?checkout=cancel`,
    });
    if (!session.url) return fail(await tErr("billing.checkoutFailed"));
    return { error: null, url: session.url };
  } catch (err) {
    console.error("createCheckoutSessionAction:", err instanceof Error ? err.message : err);
    return fail(await tErr("billing.checkoutFailed"));
  }
}

/** Stripe Customer Portal — zmena tarify, karta, faktúry, zrušenie. */
export async function createPortalSessionAction(): Promise<BillingRedirectState> {
  const auth = await requireTrainer();
  if (!auth.ok) return fail(auth.error);
  if (!isStripeConfigured()) return fail(await tErr("billing.notConfigured"));

  try {
    const { row } = await getTrainerBilling(auth.supabase, auth.user.id);
    if (!row?.stripe_customer_id) return fail(await tErr("billing.noCustomer"));
    return { error: null, url: await portalUrl(row.stripe_customer_id) };
  } catch (err) {
    console.error("createPortalSessionAction:", err instanceof Error ? err.message : err);
    return fail(await tErr("billing.portalFailed"));
  }
}
