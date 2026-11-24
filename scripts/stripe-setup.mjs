#!/usr/bin/env node
// FitPilot — založenie TESTOVACÍCH produktov a mesačných cien v Stripe (feature/Stripe).
//
//   node scripts/stripe-setup.mjs
//
// - Číta STRIPE_SECRET_KEY z .env.local (alebo z premennej prostredia).
// - Pracuje VÝHRADNE v testovacom režime: kľúč musí začínať sk_test_ (alebo rk_test_).
//   Živý kľúč (sk_live_…) skript odmietne a nič nevytvorí — tarify pre ostrú prevádzku
//   sa zakladajú ručne v Stripe Dashboarde (viď docs/billing/README.md).
// - Je idempotentný: ceny sa hľadajú podľa lookup_key, takže opakované spustenie
//   nevytvorí duplikáty — len znova vypíše riadky pre .env.local.
// - Nič nezapisuje do .env.local ani do databázy; vypíše riadky, ktoré treba vložiť ručne.
//
// Sumy sú TESTOVACIE zástupné hodnoty (19 / 49 / 99 EUR mesačne) — reálne sa nič nestrháva.

import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const require = createRequire(import.meta.url);

function loadEnv() {
  const env = { ...process.env };
  try {
    for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env.local nemusí existovať — stačí premenná prostredia
  }
  return env;
}

const TIERS = [
  { tier: "starter", name: "FitPilot Starter (test)", amount: 1900, envKey: "STRIPE_PRICE_STARTER", description: "Až 10 aktívnych klientov, bez AI." },
  { tier: "pro", name: "FitPilot Pro (test)", amount: 4900, envKey: "STRIPE_PRICE_PRO", description: "Až 50 klientov + AI Kouč a AI generátory." },
  { tier: "business", name: "FitPilot Business (test)", amount: 9900, envKey: "STRIPE_PRICE_BUSINESS", description: "Bez limitu klientov + pokročilé reporty a branding." },
];

const key = (loadEnv().STRIPE_SECRET_KEY ?? "").trim();
if (!key) {
  console.error("Chýba STRIPE_SECRET_KEY (.env.local alebo premenná prostredia). Použi testovací kľúč sk_test_… zo Stripe Dashboardu (Test mode).");
  process.exit(1);
}
if (/^(sk|rk)_live_/.test(key)) {
  console.error("ODMIETNUTÉ: toto je ŽIVÝ kľúč (sk_live_…). Skript smie bežať len s testovacím kľúčom (sk_test_…). Nič sa nevytvorilo.");
  process.exit(1);
}
if (!/^(sk|rk)_test_/.test(key)) {
  console.error("Neznámy formát kľúča — očakáva sa sk_test_… (testovací režim). Nič sa nevytvorilo.");
  process.exit(1);
}

const Stripe = require("stripe");
const stripe = new Stripe(key, { appInfo: { name: "FitPilot setup" } });

const out = [];
for (const t of TIERS) {
  const lookupKey = `fitpilot_${t.tier}_monthly_eur`;
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  let price = existing.data[0];
  if (price) {
    console.log(`= ${t.tier}: cena už existuje (${price.id}), preskakujem.`);
    // starší produkt bez daňového kódu (Managed Payments ho vyžaduje) — doplň
    const prodId = typeof price.product === "string" ? price.product : price.product.id;
    const prod = await stripe.products.retrieve(prodId);
    if (!prod.tax_code) await stripe.products.update(prodId, { tax_code: "txcd_10103001" });
  } else {
    const product = await stripe.products.create({
      name: t.name,
      description: t.description,
      // Daňový kód „SaaS — firemné použitie“: Stripe Managed Payments (predvolene zapnuté) bez neho
      // odmietne Checkout („product tax code is missing“) — Stripe podľa neho počíta DPH v EÚ.
      tax_code: "txcd_10103001",
      metadata: { app: "fitpilot", tier: t.tier },
    });
    price = await stripe.prices.create({
      product: product.id,
      currency: "eur",
      unit_amount: t.amount,
      recurring: { interval: "month" },
      lookup_key: lookupKey,
      metadata: { app: "fitpilot", tier: t.tier },
    });
    console.log(`+ ${t.tier}: vytvorený produkt ${product.id}, cena ${price.id} (${t.amount / 100} EUR / mesiac).`);
  }
  out.push(`${t.envKey}=${price.id}`);
}

console.log(`
=====================================================================
1) Vlož do .env.local (a neskôr do Vercel → Environment Variables):

${out.join("\n")}

2) Webhook lokálne — v druhom termináli (Stripe CLI, stripe.com/docs/stripe-cli):

   stripe login
   stripe listen --forward-to localhost:3000/api/stripe/webhook

   CLI vypíše "whsec_…" — vlož ho do .env.local ako STRIPE_WEBHOOK_SECRET a reštartuj
   "npm run dev". Webhook počúva udalosti: checkout.session.completed,
   customer.subscription.created / updated / deleted, invoice.paid, invoice.payment_failed.

3) Customer Portal (Stripe Dashboard → Settings → Billing → Customer portal, Test mode):

   - Zapni "Customers can switch plans" a pridaj produkty Starter, Pro a Business
     (všetky tri mesačné ceny) — tréner si tak mení tarifu sám.
   - Zapni "Cancel subscriptions" s možnosťou "At end of billing period" (zrušenie ku koncu obdobia).
   - Zapni "Update payment methods" a "Invoice history".
   - Kliknutím na "Save changes" ulož konfiguráciu.

4) Zlyhané platby (Stripe Dashboard → Settings → Billing → Subscriptions and emails →
   "Manage failed payments"): nastav opakované pokusy na ~7 dní a po ich vyčerpaní
   "Cancel the subscription" (alebo "Mark as unpaid"). Appka dáva 7-dňový odklad
   od prvého zlyhania a potom prepne účet na len na čítanie.

Testovacia karta: 4242 4242 4242 4242, ľubovoľný budúci dátum a CVC.
=====================================================================`);
