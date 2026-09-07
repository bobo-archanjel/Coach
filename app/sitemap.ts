import type { MetadataRoute } from "next";

// feature/security#2 — len skutočne verejné stránky. /dashboard a /portal sú
// za loginom (RLS aj auth guard v layout.tsx) — vyhľadávač by tam aj tak
// nikdy nič neuvidel, zaradenie do sitemap by bolo len zavádzajúce.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://fitpilot.sk";
  const now = new Date();

  // Ochrana súkromia / obchodné podmienky zámerne CHÝBAJÚ — obe stránky majú
  // `robots: { index: false }` (draft, čaká na právnu kontrolu, viď ich
  // metadata), zaradenie do sitemap by bolo protirečivé. Pridať sem, až sa
  // noindex odstráni.
  return [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/prihlasenie`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];
}
