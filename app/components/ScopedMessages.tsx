"use client";

import { NextIntlClientProvider, useLocale, useMessages } from "next-intl";

/* Doplní texty oblasti (/dashboard, /portal) k tým z koreňového layoutu — ten posiela len texty verejných
   stránok (lib/i18n/clientMessages.ts). Koreňové texty sa berú z už existujúceho kontextu v prehliadači,
   po sieti ide len `extra`. */
export function ScopedMessages({ extra, children }: { extra: Record<string, unknown>; children: React.ReactNode }) {
  const parent = useMessages();
  const locale = useLocale();
  return (
    <NextIntlClientProvider locale={locale} messages={{ ...parent, ...extra }} timeZone="Europe/Bratislava">
      {children}
    </NextIntlClientProvider>
  );
}
