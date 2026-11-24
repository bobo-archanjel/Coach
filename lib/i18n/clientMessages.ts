import type { Messages } from "@/messages";

/* Texty pre klientske komponenty (NextIntlClientProvider) po rozsahoch (výkon).
   Predtým sa do KAŽDÉHO HTML (aj prihlásenia a verejných stránok) vkladalo ~190 kB JSON so všetkými
   menými priestormi. Teraz: koreňový layout pošle len CLIENT_BASE (verejné stránky), /dashboard a /portal
   si v layoute doplnia svoje (app/components/ScopedMessages.tsx).
   Menné priestory, ktoré nepoužíva žiadny klientsky komponent (landing, pdf, ai, system, legal, errors, mail,
   portalData, meta, …), sa do prehliadača neposielajú vôbec — server komponenty a akcie čítajú plné texty
   cez next-intl/server (i18n/request.ts).
   Zoznamy hlása a stráži `node scripts/i18n-scopes.mjs --check` (e2e/i18n.spec.ts): ak nový klientsky
   komponent použije priestor, ktorý v jeho rozsahu chýba, kontrola zlyhá. */

/** Verejné stránky (prihlásenie, verejná stránka trénera, landing, právne texty). */
export const CLIENT_BASE = ["auth", "language", "password", "publicPage", "theme"] as const;

/** Navyše pre /dashboard (zoradené abecedne; zahŕňa aj priestory zdieľané s portálom). */
export const CLIENT_DASHBOARD = [
  "analytics",
  "bell",
  "billing",
  "branding",
  "calendar",
  "chat",
  "clientBuilder",
  "clientDetail",
  "clients",
  "common",
  "components",
  "food",
  "gamification",
  "inbox",
  "labels",
  "mealPlans",
  "nav",
  "plans",
  "reports",
  "settings",
  "templates",
  "today",
  "tour",
  "workout",
] as const;

/** Navyše pre /portal. */
export const CLIENT_PORTAL = [
  "bell",
  "branding",
  "chat",
  "clientBuilder",
  "common",
  "components",
  "food",
  "gamification",
  "labels",
  "mealPlans",
  "nav",
  "plans",
  "portal",
  "profile",
  "stopwatch",
  "today",
  "tour",
  "training",
  "workout",
] as const;

export type ClientScope = "dashboard" | "portal";

function pick(messages: Messages, names: readonly string[]): Partial<Messages> {
  const out: Record<string, unknown> = {};
  for (const ns of names) {
    if (ns in messages) out[ns] = (messages as Record<string, unknown>)[ns];
  }
  return out as Partial<Messages>;
}

/** Texty pre koreňový provider (verejné stránky). */
export function clientMessages(messages: Messages): Partial<Messages> {
  return pick(messages, CLIENT_BASE);
}

/** Doplnok textov pre /dashboard alebo /portal (zlučuje sa s koreňovými v ScopedMessages). */
export function scopedMessages(messages: Messages, scope: ClientScope): Partial<Messages> {
  return pick(messages, scope === "dashboard" ? CLIENT_DASHBOARD : CLIENT_PORTAL);
}
