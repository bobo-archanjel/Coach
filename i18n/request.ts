import { getRequestConfig } from "next-intl/server";
import { getUserLocale } from "@/lib/i18n/server";
import { MESSAGES } from "@/messages";

/** Jazyk a texty pre server komponenty a server actions (next-intl bez i18n routingu —
 *  jazyk nie je v URL, ale v cookie `fp-locale`; viď lib/i18n/server.ts). */
export default getRequestConfig(async () => {
  const locale = await getUserLocale();
  return {
    locale,
    messages: MESSAGES[locale],
    // Appka počíta dni a časy v Europe/Bratislava (rovnaký čas ako Praha)
    timeZone: "Europe/Bratislava",
  };
});
