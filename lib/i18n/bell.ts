/* Texty zvončekov (lib/dashboard/attention.ts, lib/portal/attention.ts) — čisté funkcie
   bez Reactu (bežia v prehliadači aj v unit testoch), preto vlastný translator nad
   malým menným priestorom `bell` namiesto useTranslations. */
import { createTranslator } from "next-intl";
import skBell from "@/messages/sk/bell.json";
import csBell from "@/messages/cs/bell.json";
import { intlLocale, type Locale } from "./locales";

const BELL: Record<Locale, typeof skBell> = { sk: skBell, cs: csBell };

export function bellTranslator(locale: Locale) {
  return createTranslator({ locale, messages: { bell: BELL[locale] }, namespace: "bell" });
}

/** „št 13. 11. 14:00“ — čas termínu v zóne Europe/Bratislava, v jazyku používateľa. */
export function formatApptWhen(startsAt: string, locale: Locale): string {
  return new Date(startsAt).toLocaleString(intlLocale(locale), {
    weekday: "short",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Bratislava",
  });
}
