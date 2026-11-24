import { getLocale, getTranslations } from "next-intl/server";
import { buildDefaultManifest } from "@/lib/branding/manifest";

/* Predvolený manifest FitPilot — verejný, pre každú stránku okrem portálu (ten má vlastný,
   /portal/manifest.webmanifest, so značkou trénera). Jazyk popisu sa berie z cookie locale. */
export const dynamic = "force-dynamic";

export async function GET() {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("meta")]);
  return new Response(JSON.stringify(buildDefaultManifest(locale, t("description"))), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      Vary: "Cookie",
    },
  });
}
