// FitPilot — kanonický host webu. JEDNO miesto pravdy pre robots, sitemap, metadataBase a JSON-LD.
// Produkcia beží na www.myfitpilot.sk; NEXT_PUBLIC_SITE_URL (ak je nastavená) má prednosť.

import { buildTrainerPublicUrl, trainerSubdomainBase } from "@/lib/publicPage/subdomain";

export const DEFAULT_SITE_URL = "https://www.myfitpilot.sk";

export function siteUrl(env: Record<string, string | undefined> = process.env): string {
  const raw = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (raw && /^https?:\/\//.test(raw)) return raw.replace(/\/+$/, "");
  return DEFAULT_SITE_URL;
}

/** Kanonická verejná adresa stránky trénera: <handle>.<TRAINER_SUBDOMAIN_BASE> ak je funkcia zapnutá, inak <site>/t/<handle>. */
export function trainerPublicUrl(handle: string, env: Record<string, string | undefined> = process.env): string {
  return buildTrainerPublicUrl(handle, trainerSubdomainBase(env), siteUrl(env));
}

/** JSON → bezpečný obsah `<script type="application/ld+json">` (`<` sa escapuje, nejde ukončiť tag). */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\u003c");
}
