// FitPilot — AI generátor plánu: kategórie tréningových dní pre RÝCHLE
// jednodňové generovanie (feature/ai-plan-partie, 2026-09-18).
//
// Nahrádza automatický "split builder" (feature/ai-plan-kategorie, 2026-09-17,
// funkcia `buildSplit`): appka vtedy SAMA rozhodovala, ktorý deň v týždni bude
// push/pull/legs/... — teda rozhodovala ZA trénera o štruktúre celého plánu.
// To presne NIE JE to, čo tréner chcel. Appka už nerozhoduje o rozdelení
// viacdňového plánu na kategórie — `daysPerWeek` dní s "Zameraním"
// (vyvážene/horná/dolná) sa generuje jednoduchým pomerom v prompte, presne ako
// pred `buildSplit` (feature/ai-plan-zameranie, `enforceFocus` v
// lib/ai/planGenerator.ts + lib/ai/planTaxonomy.ts).
//
// Čo ZOSTÁVA a znovu sa používa: mapovanie kategória → muscle_group nižšie
// (DAY_CATEGORY_MUSCLE_GROUPS/candidatesForCategory) — presne to, čo tréner
// potrebuje, len inak zapojené: nie na rozdelenie CELÉHO týždňa, ale na
// RÝCHLE vygenerovanie JEDNÉHO tréningového dňa na konkrétnu partiu,
// nezávisle od `daysPerWeek` (select "Zameranie", jeden plochý dropdown,
// pozri AiPlanGeneratorForm.tsx).
//
// Čisté funkcie bez závislosti na Supabase/Anthropic SDK — testovateľné
// oddelene (rovnaký vzor ako lib/ai/planTaxonomy.ts).

export type DayCategory =
  | "push"
  | "pull"
  | "legs"
  | "upper"
  | "lower"
  | "fullbody"
  | "arms"
  | "chest"
  | "back"
  | "shoulders";

export const DAY_CATEGORIES: DayCategory[] = [
  "push",
  "pull",
  "legs",
  "upper",
  "lower",
  "fullbody",
  "arms",
  "chest",
  "back",
  "shoulders",
];

/** Slovenský názov kategórie — použitý ako text voľby v selecte AJ ako `workout_days.name`/názov plánu pri jednodňovom generovaní. Tréner ho vie premenovať v PlanBuilderi ako hocijaký iný. */
export const DAY_CATEGORY_LABEL_SK: Record<DayCategory, string> = {
  push: "Tlak (Push)",
  pull: "Ťah (Pull)",
  legs: "Nohy",
  upper: "Horná časť tela",
  lower: "Dolná časť tela",
  fullbody: "Celé telo",
  arms: "Ruky",
  chest: "Hrudník",
  back: "Chrbát",
  shoulders: "Ramená",
};

/** Celoplánové hodnoty selectu "Zameranie" — menia pomer cvikov na `daysPerWeek` dní (ako doteraz), žiadny split builder. */
export type WholePlanFocus = "vyvazene" | "horna" | "dolna";
export const WHOLE_PLAN_FOCUSES: WholePlanFocus[] = ["vyvazene", "horna", "dolna"];
export const WHOLE_PLAN_FOCUS_LABEL_SK: Record<WholePlanFocus, string> = {
  vyvazene: "Vyvážene",
  horna: "Viac horná časť tela",
  dolna: "Viac dolná časť tela (zadok)",
};

/**
 * Jeden plochý select "Zameranie" má 13 hodnôt naraz: 3 celoplánové (menia pomer
 * na `daysPerWeek` dní) + 10 partiových (rýchle vygenerovanie JEDNÉHO dňa,
 * `daysPerWeek` sa ignoruje). `DayCategory` sa tu znovu použije ako podmnožina
 * `PlanFocus` — obe strany selectu zdieľajú jeden typ/hodnoty.
 */
export type PlanFocus = WholePlanFocus | DayCategory;
export const SINGLE_DAY_FOCUSES: DayCategory[] = DAY_CATEGORIES;
export const PLAN_FOCUSES: PlanFocus[] = [...WHOLE_PLAN_FOCUSES, ...SINGLE_DAY_FOCUSES];

/** true = partiová voľba (rýchly 1 deň), false = celoplánová voľba (`daysPerWeek` dní ako doteraz). */
export function isSingleDayFocus(focus: PlanFocus): focus is DayCategory {
  return (SINGLE_DAY_FOCUSES as PlanFocus[]).includes(focus);
}

/**
 * muscle_group je v knižnici uložený ako SK reťazec — presne hodnoty z mapy
 * `MUSCLE_SK` v scripts/import-exercises.mjs. Kľúče tu MUSIA sedieť s tou
 * mapou — ak sa import zmení, zmeň aj toto. `krk` (neck) sa zámerne nepriraďuje
 * k žiadnej kategórii dňa (okrajová partia, žiadny deň ju necieli explicitne).
 */
const CHEST_GROUPS = ["hrudník"];
const BACK_GROUPS = ["chrbát (širák)", "spodný chrbát", "stredný chrbát", "trapézy"];
const SHOULDER_GROUPS = ["ramená"];
const ARM_GROUPS = ["biceps", "triceps", "predlaktia"];
const LEG_GROUPS = [
  "stehná (kvadriceps)",
  "zadné stehná",
  "zadok",
  "lýtka",
  "abduktory (vonkajšie stehná)",
  "adduktory (vnútorné stehná)",
];
/** "core"/brucho nie je vlastná kategória dňa — doplnkovo sa smie objaviť len v legs/lower a fullbody. */
const CORE_GROUPS = ["brucho"];

export const DAY_CATEGORY_MUSCLE_GROUPS: Record<DayCategory, string[]> = {
  chest: CHEST_GROUPS,
  back: BACK_GROUPS,
  shoulders: SHOULDER_GROUPS,
  arms: ARM_GROUPS,
  legs: [...LEG_GROUPS, ...CORE_GROUPS],
  lower: [...LEG_GROUPS, ...CORE_GROUPS],
  push: [...CHEST_GROUPS, ...SHOULDER_GROUPS, "triceps"],
  pull: [...BACK_GROUPS, "biceps"],
  upper: [...CHEST_GROUPS, ...BACK_GROUPS, ...SHOULDER_GROUPS, ...ARM_GROUPS],
  fullbody: [...CHEST_GROUPS, ...BACK_GROUPS, ...LEG_GROUPS, ...SHOULDER_GROUPS, ...CORE_GROUPS],
};

/** Minimálny počet cvikov na jednodňový partiový plán po filtri neplatných exercise_id — inak appka dopĺňa z kandidátov danej kategórie (viď planGenerator.ts). */
export const MIN_EXERCISES_PER_CATEGORY_DAY = 3;

/**
 * Kandidáti patriaci danej kategórii — filter podľa muscle_group, aplikuje sa
 * PO equipment filtri (planTaxonomy.ts), nie namiesto neho. `fullbody` sa ako
 * filter nepoužíva (žiadne obmedzenie kandidátov) — len vynúti presne 1 deň,
 * viď planGenerator.ts.
 */
export function candidatesForCategory<T extends { muscleGroup: string }>(candidates: T[], category: DayCategory): T[] {
  const groups = DAY_CATEGORY_MUSCLE_GROUPS[category];
  return candidates.filter((c) => groups.includes(c.muscleGroup.trim()));
}
