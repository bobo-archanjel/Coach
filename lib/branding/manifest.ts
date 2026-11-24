// FitPilot — web app manifest (inštalácia na plochu). Čistý modul bez I/O (testy: e2e/branding.spec.ts).
// Dve podoby: predvolený FitPilot (korenový /manifest.webmanifest) a manifest portálu klienta
// (/portal/manifest.webmanifest) — pri klientovi trénera s Business so značkou (názov, farba, ikony).

import type { PublicBranding } from "./types";

export interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

export interface WebManifest {
  id: string;
  name: string;
  short_name: string;
  description?: string;
  lang: string;
  start_url: string;
  scope: string;
  display: "standalone";
  orientation: "portrait";
  theme_color: string;
  background_color: string;
  icons: ManifestIcon[];
}

/** Predvolená FitPilot ikona a farby (public/icons, generuje scripts/gen-default-icons.mjs). */
export const DEFAULT_ICONS: ManifestIcon[] = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];
/** Terakota FitPilot (--accent v6) a svetlé pozadie témy — rovnaké ako v app/v6design/theme.ts. */
export const DEFAULT_THEME_COLOR = "#d9694a";
export const DEFAULT_BACKGROUND = "#f3eee9";

/** Dĺžka krátkeho názvu pod ikonou (Android skracuje nad ~12 znakov). */
export const SHORT_NAME_MAX = 12;

/** Krátky názov pod ikonou: celý názov, ak sa zmestí, inak prvé slovo, inak orezaný na 12 znakov. */
export function shortBrandName(name: string): string {
  const chars = Array.from(name.trim());
  if (chars.length === 0) return "FitPilot";
  if (chars.length <= SHORT_NAME_MAX) return chars.join("");
  const firstWord = name.trim().split(/\s+/)[0];
  if (firstWord && Array.from(firstWord).length >= 3 && Array.from(firstWord).length <= SHORT_NAME_MAX) return firstWord;
  return chars.slice(0, SHORT_NAME_MAX).join("").trimEnd();
}

/** Manifest portálu klienta. `branding` = značka trénera s Business, inak predvolený FitPilot. */
export function buildPortalManifest(branding: PublicBranding | null, lang: string, description?: string): WebManifest {
  // scope bez koncového „/“: start_url „/portal“ musí byť v rozsahu (inak ho prehliadač zahodí na „/“)
  const base = { lang, start_url: "/portal", scope: "/portal", display: "standalone" as const, orientation: "portrait" as const };
  if (!branding) {
    return {
      id: "/portal",
      name: "FitPilot",
      short_name: "FitPilot",
      ...(description ? { description } : {}),
      ...base,
      theme_color: DEFAULT_THEME_COLOR,
      background_color: DEFAULT_BACKGROUND,
      icons: DEFAULT_ICONS,
    };
  }
  const name = branding.brandName || "FitPilot";
  const accent = branding.theme?.light.accent;
  const icons: ManifestIcon[] = branding.icons
    ? [
        { src: branding.icons.i192, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: branding.icons.i512, sizes: "512x512", type: "image/png", purpose: "any" },
        { src: branding.icons.maskable, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ]
    : DEFAULT_ICONS;
  return {
    id: "/portal",
    name,
    short_name: shortBrandName(name),
    ...(description ? { description } : {}),
    ...base,
    theme_color: accent ?? DEFAULT_THEME_COLOR,
    background_color: accent ?? DEFAULT_BACKGROUND,
    icons,
  };
}

/** Predvolený manifest FitPilot (verejný, bez prihlásenia). */
export function buildDefaultManifest(lang: string, description?: string): WebManifest {
  return {
    id: "/",
    name: "FitPilot",
    short_name: "FitPilot",
    ...(description ? { description } : {}),
    lang,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: DEFAULT_THEME_COLOR,
    background_color: DEFAULT_BACKGROUND,
    icons: DEFAULT_ICONS,
  };
}
