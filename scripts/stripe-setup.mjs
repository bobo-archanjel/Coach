#!/usr/bin/env node
// FitPilot — založenie produktov, mesačných cien a konfigurácie Customer Portalu v Stripe (feature/Stripe).
//
//   node scripts/stripe-setup.mjs            (testovací režim — predvolené)
//   node scripts/stripe-setup.mjs --live     (ostrý režim, len so STRIPE_SETUP_ALLOW_LIVE=yes)
//
// - Číta STRIPE_SECRET_KEY z .env.local (alebo z premennej prostredia).
// - Predvolene pracuje VÝHRADNE v testovacom režime: kľúč musí začínať sk_test_ (alebo rk_test_).
//   Živý kľúč (sk_live_…) skript odmietne a nič nevytvorí, kým nie je zadaný `--live` A zároveň
//   premenná STRIPE_SETUP_ALLOW_LIVE=yes (aby sa to nestalo omylom).
// - Je idempotentný: ceny sa hľadajú podľa lookup_key, produkty podľa metadata.variant, konfigurácia
//   Portalu sa len aktualizuje — opakované spustenie nevytvorí duplikáty, len znova vypíše riadky pre .env.local.
// - Nič nezapisuje do .env.local ani do databázy; vypíše riadky, ktoré treba vložiť ručne.
//
// Tarify (mesačne, EUR): Starter 5 klientov 15 €, Starter 10 klientov 20 €, Pro (do 30 klientov) 30 €,
// Business (bez limitu) 99 €. Ceny v Stripe sú nemenné → pri zmene sumy sa vytvorí NOVÁ cena
// s novým lookup_key a stará sa archivuje (LEGACY nižšie).

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

// Daňový kód „SaaS — firemné použitie“: Stripe Managed Payments (predvolene zapnuté) bez neho
// odmietne Checkout („product tax code is missing“) — Stripe podľa neho počíta DPH v EÚ.
const TAX_CODE = "txcd_10103001";

// Jeden produkt na variant: Customer Portal nepovoľuje dve ceny s rovnakým intervalom pod jedným
// produktom, takže Starter 5 a Starter 10 sú dva produkty (obe tarify Starter, rôzny limit klientov).
const PRODUCTS = [
  { variant: "starter5", tier: "starter", name: "FitPilot Starter 5", description: "Starter do 5 aktívnych klientov: tréningový builder, plány, jedálničky a food diary, základný dashboard, vlastné šablóny. Bez AI." },
  { variant: "starter10", tier: "starter", name: "FitPilot Starter 10", description: "Starter do 10 aktívnych klientov: tréningový builder, plány, jedálničky a food diary, základný dashboard, vlastné šablóny. Bez AI.", adoptsLegacyStarter: true },
  { variant: "pro", tier: "pro", name: "FitPilot Pro", description: "Do 30 aktívnych klientov + AI generátor plánov a jedálničkov, AI Kouč pre klientov, AI zhrnutia a pokročilé reporty." },
  { variant: "business", tier: "business", name: "FitPilot Business", description: "Bez limitu klientov + všetko z Pro a vlastné logo / branding appky." },
];

// variant → { produkt, suma v centoch, lookup_key, premenná v .env }
const PRICES = [
  { variant: "starter5", tier: "starter", amount: 1500, lookupKey: "fitpilot_starter5_monthly_eur", envKey: "STRIPE_PRICE_STARTER_5" },
  { variant: "starter10", tier: "starter", amount: 2000, lookupKey: "fitpilot_starter10_monthly_eur", envKey: "STRIPE_PRICE_STARTER_10" },
  { variant: "pro", tier: "pro", amount: 3000, lookupKey: "fitpilot_pro30_monthly_eur", envKey: "STRIPE_PRICE_PRO" },
  { variant: "business", tier: "business", amount: 9900, lookupKey: "fitpilot_business_monthly_eur", envKey: "STRIPE_PRICE_BUSINESS" },
];

// Staršie ceny (Starter 19 €, Pro 49 €) — archivujú sa; existujúce predplatné na nich ďalej beží
// (appka ich rozpozná podľa lookup_key, viď LOOKUP_KEY_VARIANT v lib/billing/plans.ts).
const LEGACY_LOOKUP_KEYS = ["fitpilot_starter_monthly_eur", "fitpilot_pro_monthly_eur"];

const env = loadEnv();
const key = (env.STRIPE_SECRET_KEY ?? "").trim();
const wantLive = process.argv.includes("--live");

if (!key) {
  console.error("Chýba STRIPE_SECRET_KEY (.env.local alebo premenná prostredia). Použi testovací kľúč sk_test_… zo Stripe Dashboardu (Test mode).");
  process.exit(1);
}
const isLiveKey = /^(sk|rk)_live_/.test(key);
if (isLiveKey && !(wantLive && env.STRIPE_SETUP_ALLOW_LIVE === "yes")) {
  console.error(
    "ODMIETNUTÉ: toto je ŽIVÝ kľúč (sk_live_…). Skript beží s testovacím kľúčom (sk_test_…). " +
      "Pre ostrý režim treba `--live` a STRIPE_SETUP_ALLOW_LIVE=yes. Nič sa nevytvorilo.",
  );
  process.exit(1);
}
if (!isLiveKey && !/^(sk|rk)_test_/.test(key)) {
  console.error("Neznámy formát kľúča — očakáva sa sk_test_… (testovací režim). Nič sa nevytvorilo.");
  process.exit(1);
}
if (wantLive && !isLiveKey) {
  console.error("`--live` vyžaduje živý kľúč (sk_live_…). Nič sa nevytvorilo.");
  process.exit(1);
}

const Stripe = require("stripe");
const stripe = new Stripe(key, { appInfo: { name: "FitPilot setup" } });
const mode = isLiveKey ? "LIVE" : "test";
const suffix = isLiveKey ? "" : " (test)";
console.log(`Režim: ${mode}`);

// ---------- produkty ----------
async function ensureProduct(def) {
  let found;
  for await (const p of stripe.products.list({ active: true, limit: 100 })) {
    const sameVariant = p.metadata?.variant === def.variant;
    // pôvodné produkty bez metadata.variant sa prevezmú (jediný Starter ako Starter 10)
    const legacyStarter = !p.metadata?.variant && p.metadata?.tier === def.tier && (def.tier !== "starter" || def.adoptsLegacyStarter);
    if (p.metadata?.app === "fitpilot" && (sameVariant || legacyStarter)) {
      found = p;
      break;
    }
  }
  const fields = { name: `${def.name}${suffix}`, description: def.description, tax_code: TAX_CODE };
  if (found) {
    const needsUpdate = found.name !== fields.name || found.description !== fields.description || found.tax_code !== TAX_CODE || found.metadata?.variant !== def.variant;
    if (needsUpdate) found = await stripe.products.update(found.id, { ...fields, metadata: { app: "fitpilot", tier: def.tier, variant: def.variant } });
    console.log(`= ${def.variant}: produkt ${found.id}${needsUpdate ? " (aktualizovaný)" : ""}`);
    return found;
  }
  const created = await stripe.products.create({ ...fields, metadata: { app: "fitpilot", tier: def.tier, variant: def.variant } });
  console.log(`+ ${def.variant}: vytvorený produkt ${created.id}`);
  return created;
}

const products = {};
for (const def of PRODUCTS) products[def.variant] = await ensureProduct(def);

// ---------- ceny ----------
const out = [];
const priceIds = {};
for (const p of PRICES) {
  const existing = await stripe.prices.list({ lookup_keys: [p.lookupKey], active: true, limit: 1 });
  let price = existing.data[0];
  const priceProduct = price ? (typeof price.product === "string" ? price.product : price.product.id) : null;
  if (price && (price.unit_amount !== p.amount || price.currency !== "eur" || priceProduct !== products[p.variant].id)) {
    // suma ani produkt sa pri cene meniť nedajú — starú archivujeme a vytvoríme novú (kľúč sa presunie)
    console.log(`! ${p.variant}: existujúca cena ${price.id} má inú sumu/produkt, archivujem a vytváram novú.`);
    await stripe.prices.update(price.id, { active: false });
    price = undefined;
  }
  if (price) {
    console.log(`= ${p.variant}: cena už existuje (${price.id}), preskakujem.`);
  } else {
    price = await stripe.prices.create({
      product: products[p.variant].id,
      currency: "eur",
      unit_amount: p.amount,
      recurring: { interval: "month" },
      lookup_key: p.lookupKey,
      transfer_lookup_key: true,
      metadata: { app: "fitpilot", tier: p.tier, variant: p.variant },
    });
    console.log(`+ ${p.variant}: vytvorená cena ${price.id} (${p.amount / 100} EUR / mesiac).`);
  }
  priceIds[p.variant] = price.id;
  out.push(`${p.envKey}=${price.id}`);
}

// archivácia starých cien (predplatné na nich ďalej beží, nové sa na ne nedá založiť)
for (const lk of LEGACY_LOOKUP_KEYS) {
  const legacy = await stripe.prices.list({ lookup_keys: [lk], active: true, limit: 1 });
  for (const lp of legacy.data) {
    if (Object.values(priceIds).includes(lp.id)) continue;
    await stripe.prices.update(lp.id, { active: false });
    console.log(`- archivovaná stará cena ${lp.id} (${lk}, ${(lp.unit_amount ?? 0) / 100} EUR).`);
  }
}

// ---------- Customer Portal ----------
// Upgrade sa účtuje HNEĎ (proration_behavior always_invoice = pomerná doplatka sa fakturuje okamžite),
// downgrade (nižšia suma / kratší interval) sa naplánuje na koniec zaplateného obdobia
// (Stripe pri tom vytvorí subscription schedule — webhook ho sleduje, viď docs/billing/README.md).
const portalFeatures = {
  customer_update: { enabled: true, allowed_updates: ["email", "name", "address", "tax_id"] },
  invoice_history: { enabled: true },
  payment_method_update: { enabled: true },
  subscription_cancel: {
    enabled: true,
    mode: "at_period_end",
    proration_behavior: "none",
    cancellation_reason: { enabled: true, options: ["too_expensive", "missing_features", "switched_service", "unused", "other"] },
  },
  subscription_update: {
    enabled: true,
    default_allowed_updates: ["price"],
    // počet kusov sa nemení (1 predplatné = 1 tréner), zmena je len medzi tarifami
    products: PRODUCTS.map((def) => ({ product: products[def.variant].id, prices: [priceIds[def.variant]], adjustable_quantity: { enabled: false } })),
    proration_behavior: "always_invoice",
    schedule_at_period_end: { conditions: [{ type: "decreasing_item_amount" }, { type: "shortening_interval" }] },
  },
};

let portal;
let portalIsDefault = false;
for await (const c of stripe.billingPortal.configurations.list({ limit: 100 })) {
  if (c.is_default) {
    portal = c;
    portalIsDefault = true;
    break;
  }
}
if (portal) {
  portal = await stripe.billingPortal.configurations.update(portal.id, { features: portalFeatures, metadata: { app: "fitpilot" } });
  console.log(`= Customer Portal: aktualizovaná predvolená konfigurácia ${portal.id}.`);
} else {
  portal = await stripe.billingPortal.configurations.create({
    business_profile: { headline: "FitPilot — správa predplatného" },
    features: portalFeatures,
    metadata: { app: "fitpilot" },
  });
  console.log(`+ Customer Portal: vytvorená konfigurácia ${portal.id}.`);
}
const su = portal.features.subscription_update;
console.log(
  `  subscription_update: enabled=${su.enabled}, proration=${su.proration_behavior}, ` +
    `schedule_at_period_end=${JSON.stringify(su.schedule_at_period_end?.conditions?.map((c) => c.type))}`,
);

console.log(`
=====================================================================
1) Vlož do .env.local (a neskôr do Vercel → Environment Variables); STRIPE_PRICE_STARTER sa už nepoužíva:

${out.join("\n")}
${portalIsDefault ? "" : `STRIPE_PORTAL_CONFIGURATION=${portal.id}\n`}
   (STRIPE_PORTAL_CONFIGURATION je voliteľná: ${portalIsDefault ? "upravila sa predvolená konfigurácia účtu, netreba ju" : "bez predvolenej konfigurácie ju nastav, appka ju posiela pri vytváraní Portal session"}.)

2) Webhook lokálne — v druhom termináli (Stripe CLI, stripe.com/docs/stripe-cli):

   stripe login
   stripe listen --forward-to localhost:3000/api/stripe/webhook

   CLI vypíše "whsec_…" — vlož ho do .env.local ako STRIPE_WEBHOOK_SECRET a reštartuj
   "npm run dev". Webhook počúva udalosti: checkout.session.completed,
   customer.subscription.created / updated / deleted, invoice.paid, invoice.payment_failed
   a (naplánovaný downgrade) subscription_schedule.created / updated / released /
   canceled / completed / aborted.

3) Zlyhané platby (Stripe Dashboard → Settings → Billing → Subscriptions and emails →
   "Manage failed payments"): nastav opakované pokusy na ~7 dní a po ich vyčerpaní
   "Cancel the subscription" (alebo "Mark as unpaid"). Appka dáva 7-dňový odklad
   od prvého zlyhania a potom prepne účet na len na čítanie.

Testovacia karta: 4242 4242 4242 4242, ľubovoľný budúci dátum a CVC.
=====================================================================`);
