import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { intlLocale } from "@/lib/i18n/locales";
import { mailSiteUrl } from "@/lib/mail/config";
import { isHandleShape } from "@/lib/publicPage/handle";
import { loadPublicPage } from "@/lib/publicPage/server";
import { buildPageMetadata } from "@/lib/publicPage/seo";
import { TrainerPublicPage } from "../TrainerPublicPage";

/* /t/<handle> — verejná stránka trénera s Business. Žiadna session a žiadne dáta konkrétneho
   návštevníka; dáta stránky sa čítajú cez server cache (unstable_cache, tag + 5 min), takže DB sa
   nezaťažuje pri každej návšteve. Po uložení v nastaveniach sa cache zahodí (revalidateTag); stratu
   Business alebo odpublikovanie zachytí najneskôr po 5 minútach. Neexistujúca, nepublikovaná aj „vypnutá“
   stránka (tréner bez Business) = rovnaké 404. Celá appka beží s jazykom z cookie (next-intl), preto
   nejde o statický export, ale o ľahko renderovanú stránku. */

type Params = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { handle } = await params;
  if (!isHandleShape(handle)) return { title: "404", robots: { index: false, follow: false } };
  const page = await loadPublicPage(handle);
  if (!page) return { title: "404", robots: { index: false, follow: false } };
  const [t, locale] = await Promise.all([getTranslations("publicPage"), getLocale()]);
  return buildPageMetadata(page, {
    site: mailSiteUrl(),
    locale: intlLocale(locale as "sk" | "cs").replace("-", "_"),
    descriptionFallback: t("metaFallback"),
    siteName: t("siteName"),
  }) as Metadata;
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2ece6" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0c0b" },
  ],
};

export default async function TrainerPage({ params }: Params) {
  const { handle } = await params;
  if (!isHandleShape(handle)) notFound();
  const page = await loadPublicPage(handle);
  if (!page) notFound();
  return <TrainerPublicPage page={page} />;
}
