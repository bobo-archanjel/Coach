// FitPilot — pomocník na koreň s branding témou: trieda + inline premenné (spoločné pre portál,
// pozvánku a náhľad). Bez I/O, použiteľné aj v klientskych komponentoch.

import type { CSSProperties } from "react";
import { brandCssVars, type BrandTheme } from "./colors";

/** Inline `style` s premennými značky (alebo undefined, keď značka farbu nemá). */
export function brandStyle(theme: BrandTheme | null | undefined): CSSProperties | undefined {
  return theme ? (brandCssVars(theme) as CSSProperties) : undefined;
}
