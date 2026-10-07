// FitPilot — feature/navod: krokový obsah interaktívneho onboarding tour-u.
// Čisté dáta (žiadny import Supabase/servera), aby ich vedela použiť klientská
// komponenta aj unit test. `target` je CSS selektor smerujúci na `data-tour`
// atribút na skutočnom nav prvku (DashboardNav.tsx / PortalNav.tsx) — tour teda
// vždy ukazuje na reálne UI, nie na fiktívny mockup.

export interface TourStep {
  /** CSS selektor reálneho prvku, na ktorý tour ukazuje (data-tour atribút). */
  target: string;
  title: string;
  body: string;
}

export const TRAINER_TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="nav-clients"]',
    title: "Klienti",
    body: "Celé tvoje portfólio na jednom mieste — kto má aktívny plán, kto mešká s tréningom.",
  },
  {
    target: '[data-tour="nav-treningy"]',
    title: "Tréningy",
    body: "Postav plán ručne v builderi, alebo nech ti ho AI navrhne za pár sekúnd z knižnice cvikov.",
  },
  {
    target: '[data-tour="nav-vyziva"]',
    title: "Výživa",
    body: "Makrá a jedálničky sú tu plnohodnotná súčasť, nie platený doplnok.",
  },
  {
    target: '[data-tour="nav-spravy"]',
    title: "Správy",
    body: "Priama komunikácia s klientmi — jednotlivo, alebo hromadne celej skupine naraz.",
  },
  {
    target: '[data-tour="nav-nastavenia"]',
    title: "Nastavenia",
    body: "Tu nájdeš aj tento návod, keby si si ho niekedy chcel prejsť znova.",
  },
];

export const CLIENT_TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="nav-today"]',
    title: "Dnes",
    body: "Tvoj dnešný tréning a odkaz od trénera. Jedným ťuknutím spustíš odklikávanie sérií.",
  },
  {
    target: '[data-tour="nav-trening"]',
    title: "Tréning",
    body: "Všetky tvoje plány — aj vlastné, ak zatiaľ trénuješ bez trénera.",
  },
  {
    target: '[data-tour="nav-strava"]',
    title: "Strava",
    body: "Makrá a jedálniček na jednom mieste — appka ti spočíta cieľ podľa tvojich údajov.",
  },
  {
    target: '[data-tour="nav-dennik"]',
    title: "Denník",
    body: "Zapisuj si stravu počas dňa, appka priebežne sčíta makrá za teba.",
  },
  {
    target: '[data-tour="nav-chat"]',
    title: "Chat",
    body: "Priamy rozhovor s trénerom, keď ho máš — správy aj systémové upozornenia na jednom mieste.",
  },
  {
    target: '[data-tour="nav-profil"]',
    title: "Profil",
    body: "Tu nájdeš svoj kód pre trénera, prepojenie účtu a tento návod, keby si si ho chcel prejsť znova.",
  },
];
