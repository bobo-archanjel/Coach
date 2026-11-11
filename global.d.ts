import type { Locale } from "@/lib/i18n/locales";
import type { Messages } from "@/messages";

// Typové kľúče textov pre next-intl (useTranslations / getTranslations) — vzor je slovenčina.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
