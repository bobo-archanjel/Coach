import type { MetadataRoute } from "next";
import { listPublicPages } from "@/lib/publicPage/server";

// Verejné stránky trénerov (/t/<handle>, Business) sa do sitemap dopĺňajú z DB; sitemap sa obnovuje raz za hodinu.
export const revalidate = 3600;

// feature/security#2 — len skutočne verejné stránky. /dashboard a /portal sú
// za loginom (RLS aj auth guard v layout.tsx) — vyhľadávač by tam aj tak
// nikdy nič neuvidel, zaradenie do sitemap by bolo len zavádzajúce.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://myfitpilot.sk";
  const now = new Date();

  // Ochrana súkromia / obchodné podmienky zámerne CHÝBAJÚ — obe stránky majú
  // `robots: { index: false }` (draft, čaká na právnu kontrolu, viď ich
  // metadata), zaradenie do sitemap by bolo protirečivé. Pridať sem, až sa
  // noindex odstráni.
  // len publikované stránky trénerov s Business (RPC list_public_trainer_pages); pri chybe/bez DB prázdne
  const trainers = await listPublicPages();
  return [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/prihlasenie`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    ...trainers.map((p) => ({
      url: `${base}/t/${p.handle}`,
      lastModified: p.updatedAt ? new Date(p.updatedAt) : now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
