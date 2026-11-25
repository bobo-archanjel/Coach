// FitPilot — kanonický host webu. JEDNO miesto pravdy pre robots, sitemap, metadataBase a JSON-LD.
// Produkcia beží na www.myfitpilot.sk; NEXT_PUBLIC_SITE_URL (ak je nastavená) má prednosť.

export const DEFAULT_SITE_URL = "https://www.myfitpilot.sk";

export function siteUrl(env: Record<string, string | undefined> = process.env): string {
  const raw = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (raw && /^https?:\/\//.test(raw)) return raw.replace(/\/+$/, "");
  return DEFAULT_SITE_URL;
}

/** JSON → bezpečný obsah `<script type="application/ld+json">` (`<` sa escapuje, nejde ukončiť tag). */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\u003c");
}
