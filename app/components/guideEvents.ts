/**
 * Udalosť v okne prehliadača: „Spustiť návod znova“ (OnboardingTour, ?tour=1) vynulovalo
 * zoznam videných sprievodcov hlbších okien — SectionGuide si ho načíta znova.
 * Samostatný malý modul (vzor chatSeenEvent.ts).
 */
export const GUIDES_RESET_EVENT = "fitpilot:guides-reset";

export function announceGuidesReset(): void {
  window.dispatchEvent(new Event(GUIDES_RESET_EVENT));
}
