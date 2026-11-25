// FitPilot — SEO metadáta verejnej stránky trénera. Čistý modul (testy: e2e/public-page.spec.ts).
// Vracia obyčajný objekt tvaru Next `Metadata` (bez importu servera), takže ho vie použiť aj test.

import type { PublicPageData } from "./types";

export const DESCRIPTION_MAX = 160;

/** Začiatok bio (alebo nadpis) zrezaný na krátky popis pre vyhľadávače a náhľad odkazu. */
export function pageDescription(page: Pick<PublicPageData, "bio" | "headline">, fallback: string): string {
  const src = (page.bio || page.headline || "").replace(/\s+/g, " ").trim();
  if (!src) return fallback;
  if (src.length <= DESCRIPTION_MAX) return src;
  const cut = src.slice(0, DESCRIPTION_MAX - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 80 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:!?-]+$/, "")}…`;
}

export function pageCanonical(site: string, handle: string): string {
  return `${site.replace(/\/+$/, "")}/t/${handle}`;
}

export interface PageMetadata {
  title: string;
  description: string;
  alternates: { canonical: string };
  robots: { index: boolean; follow: boolean };
  openGraph: {
    title: string;
    description: string;
    url: string;
    type: "profile";
    siteName: string;
    locale: string;
    images: { url: string; width: number; height: number; alt: string }[];
  };
  twitter: { card: "summary_large_image"; title: string; description: string };
}

export function buildPageMetadata(
  page: Pick<PublicPageData, "handle" | "displayName" | "headline" | "bio">,
  opts: { site: string; locale: string; descriptionFallback: string; siteName: string },
): PageMetadata {
  const title = page.headline ? `${page.displayName} — ${page.headline}` : page.displayName;
  const description = pageDescription(page, opts.descriptionFallback);
  const url = pageCanonical(opts.site, page.handle);
  return {
    title,
    description,
    alternates: { canonical: url },
    // publikovaná stránka sa má indexovať; nepublikovaná sa nikdy nevykreslí (404)
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url,
      type: "profile",
      siteName: opts.siteName,
      locale: opts.locale,
      images: [{ url: `${url}/og`, width: 1200, height: 630, alt: page.displayName }],
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** JSON-LD (schema.org ProfessionalService) verejnej stránky trénera — len verejné polia, prázdne sa vynechajú. */
export function buildPageJsonLd(
  page: Pick<PublicPageData, "handle" | "displayName" | "headline" | "bio" | "location" | "photoUrl" | "logoUrl" | "socials">,
  site: string,
): Record<string, unknown> {
  const url = pageCanonical(site, page.handle);
  const description = (page.bio || page.headline || "").replace(/\s+/g, " ").trim();
  const sameAs = Object.values(page.socials).filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u));
  return {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: page.displayName,
    url,
    ...(description ? { description } : {}),
    ...(page.photoUrl || page.logoUrl ? { image: page.photoUrl ?? page.logoUrl } : {}),
    ...(page.location ? { address: { "@type": "PostalAddress", addressLocality: page.location } } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
}
