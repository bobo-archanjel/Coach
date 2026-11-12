// i18n-ignore-file: pokyny pre AI model o jazyku odpovede (interné, nie text UI)
/* Jazyk odpovedí AI (feature/cestina). Systémové prompty sú interné pokyny pre model —
   ostávajú po slovensky (model ich chápe rovnako), mení sa len výslovný pokyn, v akom
   jazyku má odpovedať. Jazyk = jazyk používateľa, ktorý AI volá (klient pri AI Koučovi,
   tréner pri generátore plánu a zhrnutiach). */
import type { Locale } from "@/lib/i18n/locales";

/** Riadok do systémového promptu: v akom jazyku písať odpoveď. */
export function outputLanguageRule(locale: Locale): string {
  return locale === "cs"
    ? "Jazyk odpovede: výhradne spisovná čeština — žiadne slovenské slová ani tvary (používateľ má appku v češtine)."
    : "Jazyk odpovede: výhradne spisovná slovenčina — žiadne české slová ani tvary.";
}

/** Krátky názov jazyka do vety promptu („…po slovensky“ / „…česky“). */
export function speakLanguage(locale: Locale): string {
  return locale === "cs" ? "česky" : "po slovensky";
}
