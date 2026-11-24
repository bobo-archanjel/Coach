// FitPilot — kedy je verejná stránka trénera viditeľná. Čistý modul (testy: e2e/public-page.spec.ts).
// Zrkadlí SQL get_public_trainer_page() z migrácie 0083: stránka je verejná, len ak ju tréner PUBLIKOVAL
// a má teraz tarifu Business (billing_effective_tier = 'business'). Inak 404 — rovnaká odpoveď pre
// neexistujúci, nepublikovaný aj „vypnutý“ účet (nedá sa rozlíšiť).

export function isPageVisible(input: { published: boolean; tier: string | null | undefined }): boolean {
  return input.published === true && input.tier === "business";
}

/** Stav stránky pre nastavenia trénera (čo mu ukázať). */
export type PageState = "locked" | "draft" | "live";

export function pageState(input: { businessUnlocked: boolean; hasHandle: boolean; published: boolean }): PageState {
  if (!input.businessUnlocked) return "locked";
  return input.hasHandle && input.published ? "live" : "draft";
}
