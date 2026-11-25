// FitPilot — značka trénera vo VLASTNOM dashboarde (bočný panel, mobilná lišta). Bez I/O, použiteľné aj v klientskych
// komponentoch. Oprávnenie (Business) rieši už loadBrandingForTrainer (null = predvolený FitPilot) — rovnaké pravidlo ako portál.

import type { PublicBranding } from "./types";

/** Logo + názov, ktoré nahrádzajú značku FitPilot v navigácii dashboardu. */
export interface DashboardBrand {
  name: string;
  logoUrl: string | null;
  logoDarkUrl: string | null;
}

/**
 * Značka do navigácie dashboardu, alebo null (= ostáva FitPilot). Akcentová farba sa aplikuje samostatne
 * (brandStyle) — značka len s farbou (bez názvu a loga) mení iba akcent, nie logo.
 */
export function dashboardBrand(branding: PublicBranding | null | undefined): DashboardBrand | null {
  if (!branding) return null;
  const logoUrl = branding.logoUrl ?? null;
  const logoDarkUrl = branding.logoDarkUrl ?? null;
  if (!branding.brandName && !logoUrl && !logoDarkUrl) return null;
  return { name: branding.brandName, logoUrl, logoDarkUrl };
}
