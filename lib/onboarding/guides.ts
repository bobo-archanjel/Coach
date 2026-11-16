// FitPilot — sprievodcovia hlbších okien (feature/sprievodca-sekcii). Plynulý sprievodca
// (tourSteps.ts) prejde sekcie z menu; na okná, ktoré potrebujú konkrétny plán alebo
// klienta (builder, detail klienta, zapisovanie tréningu), sa sám nedostane. Tie majú
// vlastného krátkeho sprievodcu, ktorý sa spustí raz pri ich PRVOM otvorení. `target`
// mieri na `data-tour` atribút skutočného prvku, texty sú v messages/<jazyk>/tour.json
// pod `guides.<id>.<key>.{title,body}`.
//
// Čistý modul bez Reactu a servera — používa ho klient (SectionGuide) aj
// route handler (/api/onboarding/guides overuje id).
//
// Pravidlá:
//  - `match` vyberá podľa adresy; viac sprievodcov na tej istej adrese rozlišuje `root`
//    (prvok, ktorý musí byť na stránke — napr. otvorený builder alebo zapisovanie tréningu,
//    ktoré vlastnú adresu nemajú),
//  - sprievodca sa sám spustí, až keď sú na stránke `root` a všetky povinné kroky,
//  - `optional` krok sa vynechá, keď jeho prvok na stránke nie je (prázdny zoznam, žiadna
//    neprečítaná správa…).

export type GuideRole = "trainer" | "client";

export interface GuideStepDef {
  /** CSS selektor skutočného prvku */
  target: string;
  /** kľúč textu: guides.<id>.<key> */
  key: string;
  optional?: boolean;
}

export interface GuideDef {
  id: string;
  role: GuideRole;
  match: (pathname: string, search: URLSearchParams) => boolean;
  root?: string;
  steps: GuideStepDef[];
}

const at = (name: string) => `[data-tour="${name}"]`;
const step = (key: string, name: string): GuideStepDef => ({ key, target: at(name) });
const maybe = (key: string, name: string): GuideStepDef => ({ key, target: at(name), optional: true });
const is = (path: string) => (pathname: string) => pathname === path;
const under = (re: RegExp) => (pathname: string) => re.test(pathname);

export const GUIDES: GuideDef[] = [
  // ---------- tréner ----------
  {
    id: "t-client",
    role: "trainer",
    match: under(/^\/dashboard\/klienti\/[^/]+$/),
    steps: [
      step("tabs", "client-tabs"),
      step("trainings", "client-tab-treningy"),
      step("nutrition", "client-tab-jedalnicky"),
      step("analytics", "client-tab-analytika"),
      step("info", "client-tab-info"),
    ],
  },
  {
    id: "t-plan",
    role: "trainer",
    match: under(/^\/dashboard\/treningy\/[^/]+$/),
    steps: [
      step("days", "plan-days"),
      maybe("dayActions", "plan-day-actions"),
      maybe("exercise", "plan-exercise"),
      step("addExercise", "plan-add-exercise"),
      step("library", "plan-library"),
      step("publish", "plan-publish"),
      step("footer", "plan-footer"),
    ],
  },
  {
    id: "t-mealplan",
    role: "trainer",
    match: under(/^\/dashboard\/jedalnicky\/jedalnicek\/[^/]+$/),
    steps: [
      step("days", "meal-days"),
      maybe("slots", "meal-slots"),
      maybe("totals", "meal-totals"),
      maybe("publish", "meal-publish"),
      step("footer", "meal-footer"),
    ],
  },

  // ---------- klient ----------
  {
    // zapisovanie tréningu nemá vlastnú adresu — spustí sa, keď sa objaví formulár
    id: "c-workout",
    role: "client",
    match: is("/portal"),
    root: at("workout-form"),
    steps: [
      step("exercise", "workout-exercise"),
      maybe("addExercise", "workout-add-exercise"),
      maybe("stopwatch", "workout-stopwatch"),
      maybe("meta", "workout-meta"),
      step("finish", "workout-finish"),
    ],
  },
  {
    // builder vlastného tréningu (?tvorba=1) beží na adrese sekcie Tréning
    id: "c-builder",
    role: "client",
    match: is("/portal/trening"),
    root: at("cbuilder-days"),
    steps: [
      step("name", "cbuilder-name"),
      step("days", "cbuilder-days"),
      step("custom", "cbuilder-custom"),
      step("library", "cbuilder-library"),
      step("save", "cbuilder-save"),
    ],
  },
];

export const GUIDE_IDS: ReadonlySet<string> = new Set(GUIDES.map((g) => g.id));

/** Sprievodcovia danej role pre adresu, v poradí priority. */
export function guidesFor(role: GuideRole, pathname: string, search: URLSearchParams): GuideDef[] {
  return GUIDES.filter((g) => g.role === role && g.match(pathname, search));
}
