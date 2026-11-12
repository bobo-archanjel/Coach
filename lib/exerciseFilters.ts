// FitPilot — filter knižnice cvikov podľa partie a vybavenia (feature/AIupgrade).
// UI vrstva nad existujúcou taxonómiou AI generátora (lib/ai/planTaxonomy.ts,
// planCategories.ts) — tréner aj klient tak vedia prehľadávať tých istých ~886
// cvikov podľa partie/vybavenia, nie len voľným textom. Žiadna nová dátová
// štruktúra: muscle_group/equipment sú v knižnici už od 0011/0031, doteraz sa
// len vo filtri UI nepoužívali.
//
// Zámerne VLASTNÉ (nie prekrývajúce sa) bucket-y, na rozdiel od
// DAY_CATEGORY_MUSCLE_GROUPS (ten zámerne prekrýva partie naprieč push/pull/
// upper/fullbody pre AI generátor) — pri prehliadaní knižnice má zmysel, aby
// každý cvik patril presne do jedného filtra, nie do viacerých naraz.

import { equipmentLevel } from "./ai/planTaxonomy";

export type LibraryMuscleFilter = "hrudnik" | "chrbat" | "ramena" | "ruky" | "nohy" | "zadok" | "brucho";

export const LIBRARY_MUSCLE_FILTERS: LibraryMuscleFilter[] = [
  "hrudnik",
  "chrbat",
  "ramena",
  "ruky",
  "nohy",
  "zadok",
  "brucho",
];

// i18n-ignore-start — slovenské kľúče muscle_group z DB
/** muscle_group (raw SK hodnota z knižnice, viď scripts/import-exercises.mjs MUSCLE_SK) → filter bucket. */
const LIBRARY_MUSCLE_GROUPS: Record<LibraryMuscleFilter, string[]> = {
  hrudnik: ["hrudník"],
  chrbat: ["chrbát (širák)", "spodný chrbát", "stredný chrbát", "trapézy"],
  ramena: ["ramená"],
  ruky: ["biceps", "triceps", "predlaktia"],
  nohy: ["stehná (kvadriceps)", "zadné stehná", "lýtka", "abduktory (vonkajšie stehná)", "adduktory (vnútorné stehná)"],
  zadok: ["zadok"],
  brucho: ["brucho"],
};

// i18n-ignore-end
export function exerciseMatchesMuscleFilter(muscleGroup: string | null | undefined, filter: LibraryMuscleFilter): boolean {
  if (!muscleGroup) return false;
  return LIBRARY_MUSCLE_GROUPS[filter].includes(muscleGroup.trim().toLowerCase());
}

/** Rovnaké 3 úrovne ako PlanEquipment (lib/ai/planGenerator.ts) — rovnaký slovník naprieč appkou. */
export type LibraryEquipmentFilter = "len_telo" | "domace_vybavenie" | "plna_posilnovna";

export const LIBRARY_EQUIPMENT_FILTERS: LibraryEquipmentFilter[] = ["len_telo", "domace_vybavenie", "plna_posilnovna"];

const LIBRARY_EQUIPMENT_MAX_LEVEL: Record<LibraryEquipmentFilter, 0 | 1 | 2> = {
  len_telo: 0,
  domace_vybavenie: 1,
  plna_posilnovna: 2,
};

/** Inkluzívne — domáce vybavenie ukáže aj cviky bez vybavenia, nie len presne tú úroveň (rovnaká logika ako exerciseFitsEquipment). */
export function exerciseMatchesEquipmentFilter(
  equipment: string | null | undefined,
  filter: LibraryEquipmentFilter,
): boolean {
  return equipmentLevel(equipment) <= LIBRARY_EQUIPMENT_MAX_LEVEL[filter];
}
