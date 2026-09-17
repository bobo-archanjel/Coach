// FitPilot — AI generátor plánu: kategórie tréningových dní (feature/ai-plan-kategorie).
//
// Nahrádza pôvodný voľný pomer "horná/dolná časť tela" (feature/ai-plan-zameranie,
// 2026-09-07): dovtedy appka nechala model rozhodnúť VŠETKO naraz (aj rozdelenie
// na dni, aj balans partií, aj výber cvikov) len s číselným cieľom v prompte
// ("~55-60 % cvikov z cielenej časti") + deterministickou kontrolou CELÉHO
// plánu až po fakte (enforceFocus). To bolo nespoľahlivé, lebo to bola jedna
// veľká neurčitá úloha pre model namiesto viacerých malých overiteľných krokov.
//
// Teraz appka SAMA (deterministicky, tu) rozhodne o štruktúre týždňa — pevná
// sada kategórií dní (buildSplit) — a model dostane už rozdelené, menšie a
// overiteľné úlohy: vybrať cviky pre KONKRÉTNU kategóriu na KONKRÉTNY deň,
// nie vymyslieť celú štruktúru plánu. lib/ai/planGenerator.ts orchestruje
// (volanie modelu, per-deň kandidáti, post-generation kontrola pokrytia).
//
// Čisté funkcie bez závislosti na Supabase/Anthropic SDK — testovateľné
// oddelene (rovnaký vzor ako lib/ai/planTaxonomy.ts, ktoré si ponecháva len
// vybavenie ako filter).

import type { PlanGoal } from "./planGenerator";

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

/** Slovenský názov dňa pre `workout_days.name` — tréner ho vie premenovať v PlanBuilderi ako hocijaký iný. */
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

/** Voľný select "Zameranie" vo formulári — hodnota teraz volí kategórie dní (buildSplit), nie pomer v texte promptu. */
export type PlanFocus = "vyvazene" | "horna" | "dolna";
export const PLAN_FOCUSES: PlanFocus[] = ["vyvazene", "horna", "dolna"];
export const PLAN_FOCUS_LABEL_SK: Record<PlanFocus, string> = {
  vyvazene: "Vyvážene",
  horna: "Viac horná časť tela",
  dolna: "Viac dolná časť tela (zadok)",
};

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

/** SK názov partie "zadok" — cieľ pri kategórii legs/lower so zameraním "viac dolná časť". */
export const GLUTES_MUSCLE_GROUP = "zadok";
/** Minimálny počet cvikov na "zadok" na deň s kategóriou legs/lower pri zameraní "dolna". */
export const FOCUS_MIN_GLUTES = 2;
/** Minimálny počet cvikov na deň po filtri neplatných exercise_id — inak appka dopĺňa z kandidátov danej kategórie (viď planGenerator.ts). */
export const MIN_EXERCISES_PER_CATEGORY_DAY = 3;

/** Kandidáti patriaci danej kategórii dňa — filter podľa muscle_group, aplikuje sa PO equipment filtri (planTaxonomy.ts), nie namiesto neho. */
export function candidatesForCategory<T extends { muscleGroup: string }>(candidates: T[], category: DayCategory): T[] {
  const groups = DAY_CATEGORY_MUSCLE_GROUPS[category];
  return candidates.filter((c) => groups.includes(c.muscleGroup.trim()));
}

// ---------- deterministický split builder ----------

const UPPER_LEANING: DayCategory[] = ["push", "pull", "upper", "chest", "back", "shoulders", "arms"];
const LOWER_LEANING: DayCategory[] = ["legs", "lower"];

/**
 * Základné ("vyvážené") rozdelenie pre 1-4 dni — rovnaké pre všetky ciele.
 * Orientačné, bežné fitness-programové vzory (nie pevná špecifikácia):
 * 1-2 dni nevedia pokryť telo inak než celé naraz, 3-4 dni striedajú
 * horná/dolná so zvyškom ako celé telo.
 */
const BASE_SPLIT_SMALL: Record<number, DayCategory[]> = {
  1: ["fullbody"],
  2: ["fullbody", "fullbody"],
  3: ["upper", "lower", "fullbody"],
  4: ["upper", "lower", "upper", "lower"],
};

/**
 * Od 5 dní vyššie sa cieľ prejaví aj na tvare splitu (nielen na sets/reps cez
 * `defaultsForGoal` v planGenerator.ts): hypertrofia/sila profitujú z
 * bodypart-špecializácie (push/pull/legs, vyššia frekvencia/objem na partiu),
 * kým chudnutie/kondícia bežne nepotrebujú bodybuilding-štýl split — plný
 * telo/upper-lower rotácia je pre všeobecnú populáciu rovnako účinná a
 * jednoduchšia na dodržanie. Orientačné defaulty, nie pevná špecifikácia.
 */
const SPECIALIZATION_GOALS: PlanGoal[] = ["hypertrofia", "sila"];

const BASE_SPLIT_SPECIALIZED: Record<number, DayCategory[]> = {
  5: ["push", "pull", "legs", "upper", "lower"],
  6: ["push", "pull", "legs", "push", "pull", "legs"],
  7: ["push", "pull", "legs", "upper", "lower", "fullbody", "fullbody"],
};

const BASE_SPLIT_GENERAL: Record<number, DayCategory[]> = {
  5: ["upper", "lower", "fullbody", "upper", "lower"],
  6: ["upper", "lower", "fullbody", "upper", "lower", "fullbody"],
  7: ["upper", "lower", "fullbody", "upper", "lower", "fullbody", "fullbody"],
};

function baseSplitFor(daysPerWeek: number, goal: PlanGoal): DayCategory[] {
  if (daysPerWeek <= 4) return BASE_SPLIT_SMALL[daysPerWeek];
  const table = SPECIALIZATION_GOALS.includes(goal) ? BASE_SPLIT_SPECIALIZED : BASE_SPLIT_GENERAL;
  return table[daysPerWeek];
}

/**
 * Koľko dní zameranie smie prehodiť na cielenú kategóriu. 1 deň zostáva vždy
 * "fullbody" bez ohľadu na zameranie — jediný tréning týždenne musí pokryť
 * celé telo, zúženie na jednu polovicu by druhú nechalo úplne bez podnetu.
 */
const FOCUS_SWAP_COUNT: Record<number, number> = { 1: 0, 2: 1, 3: 1, 4: 1, 5: 1, 6: 2, 7: 2 };

/**
 * Zameranie posunie zloženie splitu, nikdy ho úplne nevyprázdni na jednu
 * stranu: "dolna" nenechá menej než 1 horná-orientovaný deň (ak nejaký v
 * základe bol) a "horna" nenechá menej než 1 dolná-orientovaný deň — plán tak
 * nikdy nestratí kompletne jednu polovicu tela, len jej dá menší priestor.
 */
function applyFocus(base: DayCategory[], focus: PlanFocus): DayCategory[] {
  const days = [...base];
  if (focus === "vyvazene") return days;

  let remaining = FOCUS_SWAP_COUNT[days.length] ?? 0;
  if (remaining === 0) return days;

  const targetCategory: DayCategory = focus === "dolna" ? "legs" : "upper";
  const isNeutral = (c: DayCategory) => c === "fullbody";
  const isOpposite = (c: DayCategory) => (focus === "dolna" ? UPPER_LEANING.includes(c) : LOWER_LEANING.includes(c));

  // 1. najprv nahraď "fullbody" (neutrálne) dni — nestráca sa tým cielená práca opačnej strany.
  for (let i = days.length - 1; i >= 0 && remaining > 0; i--) {
    if (isNeutral(days[i])) {
      days[i] = targetCategory;
      remaining--;
    }
  }

  // 2. ak treba viac, nahraď opačne-orientované dni — nikdy nie POSLEDNÝ zvyšný.
  while (remaining > 0) {
    const oppositeIdxs = days.map((c, i) => (isOpposite(c) ? i : -1)).filter((i) => i >= 0);
    if (oppositeIdxs.length <= 1) break;
    days[oppositeIdxs[oppositeIdxs.length - 1]] = targetCategory;
    remaining--;
  }

  return days;
}

/**
 * Deterministický "split builder" — appka rozhodne poradie kategórií dní,
 * nie model. Čistá funkcia (žiadne volanie AI), testovateľná priamo.
 */
export function buildSplit(daysPerWeek: number, goal: PlanGoal, focus: PlanFocus): DayCategory[] {
  const n = Math.min(7, Math.max(1, Math.round(daysPerWeek)));
  return applyFocus(baseSplitFor(n, goal), focus);
}
