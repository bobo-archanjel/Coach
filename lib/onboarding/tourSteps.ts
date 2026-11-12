// FitPilot — feature/navod: kroky interaktívneho onboarding tour-u. `target` je CSS
// selektor smerujúci na `data-tour` atribút na skutočnom prvku (DashboardNav.tsx /
// PortalNav.tsx, ikona s iniciálou) — tour teda vždy ukazuje na reálne UI. Texty krokov
// sú v messages/<jazyk>/tour.json (`trainer.<key>` / `client.<key>`); layout ich preloží
// (tourStepsFor) a OnboardingTour dostane hotové TourStep.

export interface TourStep {
  /** CSS selektor reálneho prvku, na ktorý tour ukazuje (data-tour atribút). */
  target: string;
  title: string;
  body: string;
}

export interface TourStepDef {
  target: string;
  /** kľúč v messages/<jazyk>/tour.json pod `trainer` / `client` */
  key: string;
}

export const TRAINER_TOUR_STEPS: TourStepDef[] = [
  { target: '[data-tour="nav-clients"]', key: "navClients" },
  { target: '[data-tour="nav-treningy"]', key: "navTreningy" },
  { target: '[data-tour="nav-vyziva"]', key: "navVyziva" },
  { target: '[data-tour="nav-spravy"]', key: "navSpravy" },
  { target: '[data-tour="nav-nastavenia"]', key: "navNastavenia" },
];

export const CLIENT_TOUR_STEPS: TourStepDef[] = [
  { target: '[data-tour="nav-today"]', key: "navToday" },
  { target: '[data-tour="nav-trening"]', key: "navTrening" },
  { target: '[data-tour="nav-strava"]', key: "navStrava" },
  { target: '[data-tour="nav-dennik"]', key: "navDennik" },
  { target: '[data-tour="nav-chat"]', key: "navChat" },
  { target: '[data-tour="nav-profil"]', key: "navProfil" },
];

/** Kroky s textami v jazyku požiadavky — volá serverový layout (dashboard / portál). */
export async function tourStepsFor(role: "trainer" | "client"): Promise<TourStep[]> {
  const { getTranslations } = await import("next-intl/server");
  const t = await getTranslations("tour");
  const defs = role === "trainer" ? TRAINER_TOUR_STEPS : CLIENT_TOUR_STEPS;
  return defs.map(({ target, key }) => ({
    target,
    title: t(`${role}.${key}.title` as Parameters<typeof t>[0]),
    body: t(`${role}.${key}.body` as Parameters<typeof t>[0]),
  }));
}
