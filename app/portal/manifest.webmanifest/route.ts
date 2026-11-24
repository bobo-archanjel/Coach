import { getLocale, getTranslations } from "next-intl/server";
import { loadClientBranding } from "@/lib/branding/portal";
import { buildPortalManifest } from "@/lib/branding/manifest";

/* Manifest portálu klienta (inštalácia na plochu). Pre klienta, ktorého tréner má Business so
   značkou, nesie názov, farbu a ikony trénera; inak predvolený FitPilot. Odpoveď závisí od
   prihlásenia (cookie) → `private, no-cache`: prehliadač si ju smie uložiť, no pred každým
   použitím sa spýta servera (podmienená požiadavka), takže zmena značky sa prejaví hneď.
   Prehliadač manifest sťahuje len s cookie, ak má <link> atribút crossorigin="use-credentials"
   (app/portal/layout.tsx). Chyba pri načítaní značky nikdy nezhodí inštaláciu — vráti sa predvolený. */
export const dynamic = "force-dynamic";

export async function GET() {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("meta")]);
  let branding = null;
  try {
    branding = await loadClientBranding();
  } catch (e) {
    console.error("portal manifest:", e instanceof Error ? e.message : e);
  }
  const manifest = buildPortalManifest(branding, locale, t("description"));
  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "private, no-cache",
      Vary: "Cookie",
    },
  });
}
