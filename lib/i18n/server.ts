import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, localeFromAcceptLanguage, parseLocale, type Locale } from "./locales";

/**
 * Jazyk aktuálnej požiadavky: cookie `fp-locale` (voľba používateľa, po prihlásení
 * zosynchronizovaná s profilom), inak Accept-Language, inak slovenčina.
 * Rovnaké pravidlo používa i18n/request.ts — tu pre route handlery a lib kód,
 * ktorý potrebuje jazyk explicitne (PDF, AI prompty).
 */
export const getUserLocale = cache(async (): Promise<Locale> => {
  const store = await cookies();
  const chosen = parseLocale(store.get(LOCALE_COOKIE)?.value);
  if (chosen) return chosen;
  const h = await headers();
  return localeFromAcceptLanguage(h.get("accept-language"));
});
