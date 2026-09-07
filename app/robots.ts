import type { MetadataRoute } from "next";

// feature/security#2 — appka nemala robots.txt vôbec. Disallow /dashboard a
// /portal nie je bezpečnostné opatrenie (sú aj tak za loginom, RLS ich chráni
// nezávisle od toho, čo robí robots.txt) — je to len signál vyhľadávačom, nech
// nezaťažujú appku indexovaním stránok, ktoré rovnako nikdy nezobrazia bez
// prihlásenia. Sitemap (app/sitemap.ts) obsahuje len skutočne verejné cesty.
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://fitpilot.sk";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/portal", "/api"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
