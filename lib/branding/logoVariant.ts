// FitPilot — výber variantu loga podľa témy (svetlá / tmavá). Čistý modul bez I/O (testy: e2e/branding.spec.ts).

export type LogoTheme = "light" | "dark";

/**
 * Svetlá téma: logo pre svetlé pozadie; chýba → tmavé logo (lepšie než nič).
 * Tmavá téma: logo pre tmavé pozadie; chýba → bežné logo.
 * PDF je vždy svetlé → `pickLogoVariant("light", …)` bez náhrady tmavým logom robí `pdf.ts`
 * (tmavé logo na bielom papieri by sa stratilo).
 */
export function pickLogoVariant(theme: LogoTheme, logoUrl: string | null, logoDarkUrl: string | null): string | null {
  return theme === "dark" ? (logoDarkUrl ?? logoUrl) : (logoUrl ?? logoDarkUrl);
}
