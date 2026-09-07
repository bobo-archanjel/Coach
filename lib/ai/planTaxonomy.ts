// FitPilot — AI generátor plánu (feature/ai-plan-zameranie): čistá výpočtová
// logika bez závislosti na Supabase / Anthropic SDK, aby sa dala unit-testovať
// oddelene od volania modelu (lib/ai/planGenerator.ts orchestruje, toto počíta).
//
// Dve mapy:
//  1. muscle_group (SK reťazec z knižnice) → časť tela (horná / dolná / core)
//  2. equipment (Free Exercise DB hodnota) → úroveň dostupnosti (0 telo, 1 domáce, 2 posilňovňa)

import type { PlanEquipment } from "./planGenerator";

export type PlanFocus = "vyvazene" | "horna" | "dolna";
export const PLAN_FOCUSES: PlanFocus[] = ["vyvazene", "horna", "dolna"];

export const PLAN_FOCUS_LABEL_SK: Record<PlanFocus, string> = {
  vyvazene: "Vyvážene",
  horna: "Viac horná časť tela",
  dolna: "Viac dolná časť tela (zadok)",
};

export type BodyRegion = "horna" | "dolna" | "core";

/**
 * muscle_group je v knižnici uložený ako SK reťazec — presne hodnoty z mapy
 * `MUSCLE_SK` v scripts/import-exercises.mjs (17 partií z Free Exercise DB
 * `primaryMuscles[0]`). Kľúče tu MUSIA sedieť s tou mapou — ak sa import zmení,
 * zmeň aj toto. `zadok` (glutes) je zámerne samostatná partia, nie súčasť
 * "stehná" — zameranie "viac dolná časť" ju cieli explicitne.
 */
export const MUSCLE_REGION: Record<string, BodyRegion> = {
  // dolná časť tela
  "stehná (kvadriceps)": "dolna",
  "zadné stehná": "dolna",
  "zadok": "dolna",
  "lýtka": "dolna",
  "adduktory (vnútorné stehná)": "dolna",
  "abduktory (vonkajšie stehná)": "dolna",
  // horná časť tela
  "hrudník": "horna",
  "chrbát (širák)": "horna",
  "stredný chrbát": "horna",
  "ramená": "horna",
  "biceps": "horna",
  "triceps": "horna",
  "predlaktia": "horna",
  "trapézy": "horna",
  "krk": "horna",
  // trup / core (spodný chrbát je stabilizátor trupu, nie končatina — patrí sem)
  "brucho": "core",
  "spodný chrbát": "core",
};

/** SK názov partie „zadok" — cieľ pre zameranie „viac dolná časť tela". */
export const GLUTES_MUSCLE_GROUP = "zadok";

export function regionForMuscleGroup(muscleGroup: string | null | undefined): BodyRegion | null {
  if (!muscleGroup) return null;
  return MUSCLE_REGION[muscleGroup.trim()] ?? null;
}

/**
 * equipment → úroveň dostupnosti (hierarchia, nie presná zhoda):
 *   0 = vlastná váha (nič netreba)
 *   1 = domáce vybavenie (voľné činky, guma, náčinie — „bez strojov")
 *   2 = plná posilňovňa (stroje, kladky, špecifické náčinie)
 *
 * Hranica medzi úrovňou 1 a 2 je presne „bez strojov" z labelu vo formulári:
 * `barbell`/`dumbbell`/`kettlebells`/`bands`/`e-z curl bar` aj `medicine ball`/
 * `exercise ball`/`foam roll` sú voľné náčinie, ktoré klient bežne má doma → 1.
 * `machine` (stroj) a `cable` (kladka) → 2. `other` je v datasete zberná
 * kategória (sane, sledy, TRX, špecifické stroje…) — konzervatívne 2, nech
 * klient „len telo"/„domáce" nedostane cvik, ktorý nemá s čím spraviť.
 * Neznáme / NULL → 2 z rovnakého dôvodu (radšej menší, ale istý výber).
 *
 * Presné hodnoty overené proti Free Exercise DB `dist/exercises.json`
 * (876 cvikov, 13 distinct hodnôt equipment vrátane NULL).
 */
export const EQUIPMENT_LEVEL: Record<string, 0 | 1 | 2> = {
  "body only": 0,
  dumbbell: 1,
  barbell: 1,
  kettlebells: 1,
  bands: 1,
  "e-z curl bar": 1,
  "medicine ball": 1,
  "exercise ball": 1,
  "foam roll": 1,
  machine: 2,
  cable: 2,
  other: 2,
};

export function equipmentLevel(equipment: string | null | undefined): 0 | 1 | 2 {
  if (!equipment) return 2;
  return EQUIPMENT_LEVEL[equipment.trim().toLowerCase()] ?? 2;
}

/** Najvyššia úroveň vybavenia, ktorú klient má k dispozícii. */
export function clientEquipmentLevel(planEquipment: PlanEquipment): 0 | 1 | 2 {
  switch (planEquipment) {
    case "len_telo":
      return 0;
    case "domace_vybavenie":
      return 1;
    case "plna_posilnovna":
      return 2;
  }
}

/** Cvik je pre klienta dostupný, ak jeho úroveň vybavenia nie je vyššia než klientova. */
export function exerciseFitsEquipment(exerciseEquipment: string | null | undefined, planEquipment: PlanEquipment): boolean {
  return equipmentLevel(exerciseEquipment) <= clientEquipmentLevel(planEquipment);
}

// ---------- analýza zamerania hotového plánu ----------

export interface FocusAnalysis {
  total: number;
  horna: number;
  dolna: number;
  core: number;
  /** cviky bez rozpoznanej partie (vlastný cvik trénera, chýbajúci muscle_group) */
  unknown: number;
  zadok: number;
  hornaShare: number;
  dolnaShare: number;
}

/** Spočíta rozloženie cvikov naprieč celým týždenným plánom. `regionOf` a `muscleGroupOf` mapujú cvik podľa jeho ID. */
export function analyzeFocus(
  exerciseIds: string[],
  muscleGroupById: Map<string, string | null>,
): FocusAnalysis {
  const a: FocusAnalysis = { total: 0, horna: 0, dolna: 0, core: 0, unknown: 0, zadok: 0, hornaShare: 0, dolnaShare: 0 };
  for (const id of exerciseIds) {
    a.total++;
    const mg = muscleGroupById.get(id) ?? null;
    if (mg && mg.trim() === GLUTES_MUSCLE_GROUP) a.zadok++;
    const region = regionForMuscleGroup(mg);
    if (region === "horna") a.horna++;
    else if (region === "dolna") a.dolna++;
    else if (region === "core") a.core++;
    else a.unknown++;
  }
  if (a.total > 0) {
    a.hornaShare = a.horna / a.total;
    a.dolnaShare = a.dolna / a.total;
  }
  return a;
}

/** Cieľový podiel dominantnej časti tela pre dané zameranie — prompt pýta 55–60 %, tolerancia pre kontrolu je 50 %. */
export const FOCUS_TARGET_SHARE = 0.5;
/** Minimálny počet cvikov priamo na „zadok" za týždeň pri zameraní „viac dolná časť tela". */
export const FOCUS_MIN_GLUTES = 2;

/** Splnil hotový plán zvolené zameranie? Pri „vyvážene" vždy true (žiadna dodatočná podmienka). */
export function focusTargetMet(analysis: FocusAnalysis, focus: PlanFocus): boolean {
  if (focus === "vyvazene") return true;
  if (analysis.total === 0) return false;
  if (focus === "dolna") {
    return analysis.dolnaShare >= FOCUS_TARGET_SHARE && analysis.zadok >= FOCUS_MIN_GLUTES;
  }
  return analysis.hornaShare >= FOCUS_TARGET_SHARE;
}
