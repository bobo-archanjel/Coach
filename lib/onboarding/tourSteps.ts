// FitPilot — plynulý sprievodca appkou (feature/navod, rozšírený vo feature/sprievodca-sekcii).
// Prejde sekcie z menu jednu po druhej: pri každej najprv ukáže jej položku v menu a potom
// hlavné funkcie priamo na stránke; na ďalšiu sekciu prejde sám.
//
// `target` je CSS selektor na `data-tour` atribút skutočného prvku — sprievodca teda vždy
// ukazuje na reálne UI. Texty sú v messages/<jazyk>/tour.json (`text` = cesta ku kľúču
// s `title` a `body`); layout ich preloží (tourStepsFor) a OnboardingTour dostane hotové
// TourStep. Krok, ktorého prvok na stránke nie je (prázdny zoznam, žiadna neprečítaná
// správa…), sa preskočí.
//
// Hlbšie okná, na ktoré sa sprievodca sám nedostane (builder, detail klienta, zapisovanie
// tréningu), majú vlastného krátkeho sprievodcu pri prvom otvorení — lib/onboarding/guides.ts.

export interface TourStep {
  /** CSS selektor reálneho prvku, na ktorý sprievodca ukazuje (data-tour atribút). */
  target: string;
  title: string;
  body: string;
  /** adresa sekcie, na ktorej prvok je — sprievodca na ňu pred krokom prejde */
  path: string;
  /** poradie sekcie (bodky postupu) */
  section: number;
  /** prvok menu / hlavičky (položka menu, zvonček) — je na každej stránke, takže nehovorí
   *  nič o tom, či sa obsah sekcie už načítal */
  nav: boolean;
  /** prvok, bez ktorého sa krok preskočí ešte pred prechodom na stránku (sekcia v menu chýba) */
  gate: string | null;
}

interface SectionDef {
  path: string;
  /** [data-tour položky menu, kľúč textu] */
  nav: [string, string];
  /** sekcia sa preskočí, keď jej položka v menu nie je (AI Kouč bez trénera) */
  gated?: boolean;
  /** [data-tour prvku, kľúč textu] */
  steps: [string, string][];
}

const TRAINER_SECTIONS: SectionDef[] = [
  {
    path: "/dashboard",
    nav: ["nav-clients", "trainer.navClients"],
    steps: [
      ["clients-add", "guides.t-clients.add"],
      ["clients-card", "guides.t-clients.card"],
      ["clients-unread", "guides.t-clients.unread"],
      ["clients-search", "guides.t-clients.search"],
      ["bell", "guides.t-clients.bell"],
    ],
  },
  {
    path: "/dashboard/treningy",
    nav: ["nav-treningy", "trainer.navTreningy"],
    steps: [
      ["plans-new", "guides.t-plans.new"],
      ["plans-ai", "guides.t-plans.ai"],
      ["plans-list", "guides.t-plans.list"],
    ],
  },
  {
    path: "/dashboard/jedalnicky",
    nav: ["nav-vyziva", "trainer.navVyziva"],
    steps: [
      ["mealplans-new", "guides.t-mealplans.new"],
      ["mealplans-list", "guides.t-mealplans.list"],
    ],
  },
  {
    path: "/dashboard/spravy",
    nav: ["nav-spravy", "trainer.navSpravy"],
    steps: [
      ["inbox-list", "guides.t-inbox.list"],
      ["inbox-bulk", "guides.t-inbox.bulk"],
    ],
  },
  {
    path: "/dashboard/kalendar",
    nav: ["nav-kalendar", "trainer.navKalendar"],
    steps: [
      ["calendar-new", "guides.t-calendar.new"],
      ["calendar-list", "guides.t-calendar.list"],
      ["bell", "guides.t-calendar.bell"],
    ],
  },
  {
    path: "/dashboard/sablony",
    nav: ["nav-sablony", "trainer.navSablony"],
    steps: [
      ["templates-tabs", "guides.t-templates.tabs"],
      ["templates-search", "guides.t-templates.search"],
      ["templates-card", "guides.t-templates.card"],
    ],
  },
  {
    path: "/dashboard/nastavenia",
    nav: ["nav-nastavenia", "trainer.navNastavenia"],
    steps: [["settings-guide", "guides.t-settings.guide"]],
  },
];

const CLIENT_SECTIONS: SectionDef[] = [
  {
    path: "/portal",
    nav: ["nav-today", "client.navToday"],
    steps: [
      ["today-hero", "guides.c-today.hero"],
      ["today-measure", "guides.c-today.measure"],
      ["today-week", "guides.c-today.week"],
      ["today-progress", "guides.c-today.progress"],
      ["bell", "guides.c-today.bell"],
    ],
  },
  {
    path: "/portal/trening",
    nav: ["nav-trening", "client.navTrening"],
    steps: [
      ["training-own", "guides.c-training.own"],
      ["training-plans", "guides.c-training.plans"],
      ["training-templates", "guides.c-training.templates"],
    ],
  },
  {
    path: "/portal/strava",
    nav: ["nav-strava", "client.navStrava"],
    steps: [
      ["nutrition-goal", "guides.c-nutrition.goal"],
      ["nutrition-plan", "guides.c-nutrition.plan"],
      ["nutrition-pdf", "guides.c-nutrition.pdf"],
    ],
  },
  {
    path: "/portal/dennik",
    nav: ["nav-dennik", "client.navDennik"],
    steps: [
      ["diary-totals", "guides.c-diary.totals"],
      ["diary-nav", "guides.c-diary.nav"],
      ["diary-slots", "guides.c-diary.slots"],
    ],
  },
  {
    path: "/portal/chat",
    nav: ["nav-chat", "client.navChat"],
    steps: [["chat-composer", "guides.c-chat.composer"]],
  },
  {
    path: "/portal/ai-kouc",
    nav: ["nav-ai", "client.navAi"],
    gated: true,
    steps: [
      ["ai-notice", "guides.c-ai.notice"],
      ["chat-composer", "guides.c-ai.composer"],
    ],
  },
  {
    path: "/portal/profil",
    nav: ["nav-profil", "client.navProfil"],
    steps: [
      ["profile-trainer", "guides.c-profile.trainer"],
      ["profile-appearance", "guides.c-profile.appearance"],
      ["profile-account", "guides.c-profile.account"],
      ["profile-guide", "guides.c-profile.guide"],
    ],
  },
];

const at = (name: string) => `[data-tour="${name}"]`;
/** prvky mimo obsahu stránky (v menu / hlavičke) */
const LAYOUT_TARGETS = new Set(["bell"]);

export interface TourStepDef extends Omit<TourStep, "title" | "body"> {
  /** cesta ku kľúču v messages/<jazyk>/tour.json (objekt s `title` a `body`) */
  text: string;
}

function flatten(sections: SectionDef[]): TourStepDef[] {
  return sections.flatMap((s, section) => {
    const gate = s.gated ? at(s.nav[0]) : null;
    return [
      { target: at(s.nav[0]), text: s.nav[1], path: s.path, section, nav: true, gate },
      ...s.steps.map(([name, text]) => ({ target: at(name), text, path: s.path, section, nav: LAYOUT_TARGETS.has(name), gate })),
    ];
  });
}

export const TRAINER_TOUR_STEPS: TourStepDef[] = flatten(TRAINER_SECTIONS);
export const CLIENT_TOUR_STEPS: TourStepDef[] = flatten(CLIENT_SECTIONS);

/** Kroky s textami v jazyku požiadavky — volá serverový layout (dashboard / portál). */
export async function tourStepsFor(role: "trainer" | "client"): Promise<TourStep[]> {
  const { getTranslations } = await import("next-intl/server");
  const t = await getTranslations("tour");
  const defs = role === "trainer" ? TRAINER_TOUR_STEPS : CLIENT_TOUR_STEPS;
  return defs.map(({ text, ...step }) => ({
    ...step,
    title: t(`${text}.title` as Parameters<typeof t>[0]),
    body: t(`${text}.body` as Parameters<typeof t>[0]),
  }));
}
