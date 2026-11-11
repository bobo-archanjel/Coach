/* Jazyky appky (feature/cestina). Bez importu servera/Reactu — používa sa na serveri
   (i18n/request.ts, server actions) aj v prehliadači (prepínače jazyka). */

export const LOCALES = ["sk", "cs"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "sk";

/** Zvolený jazyk — cookie (ako téma `fp-v6-theme`), nech server vykreslí správny jazyk hneď. */
export const LOCALE_COOKIE = "fp-locale";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function parseLocale(value: string | undefined | null): Locale | null {
  return isLocale(value) ? value : null;
}

/**
 * Jazyk z hlavičky Accept-Language, keď si používateľ ešte nevybral (žiadna cookie):
 * čeština, ak ju prehliadač uprednostňuje pred slovenčinou, inak slovenčina.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().toLowerCase().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { tag, q: q ? Number(q.trim().slice(2)) || 0 : 1 };
    })
    .filter((x) => x.tag)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    if (tag === "sk" || tag.startsWith("sk-")) return "sk";
    if (tag === "cs" || tag.startsWith("cs-")) return "cs";
  }
  return DEFAULT_LOCALE;
}

/** BCP 47 tag pre Intl (dátumy, čísla, triedenie). */
export function intlLocale(locale: Locale): string {
  return locale === "cs" ? "cs-CZ" : "sk-SK";
}

/** Open Graph locale (metadata). */
export function ogLocale(locale: Locale): string {
  return locale === "cs" ? "cs_CZ" : "sk_SK";
}

/** Názov jazyka v ňom samom — v prepínači sa nikdy neprekladá. */
export const LOCALE_NAME: Record<Locale, string> = { sk: "Slovenčina", cs: "Čeština" }; // i18n-ignore
/** Skratka na kompaktnom prepínači (landing). */
export const LOCALE_SHORT: Record<Locale, string> = { sk: "SK", cs: "CZ" };
