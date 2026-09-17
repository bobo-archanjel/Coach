// FitPilot — AI generátor plánu: vybavenie ako štrukturálny filter kandidátov
// (feature/ai-plan-zameranie, 2026-09-07). Čistá výpočtová logika bez
// závislosti na Supabase / Anthropic SDK, aby sa dala unit-testovať oddelene
// od volania modelu (lib/ai/planGenerator.ts orchestruje, toto počíta).
//
// Rozdelenie plánu na dni podľa kategórií a "Zameranie" select (vyvážene /
// horná / dolná) žijú v lib/ai/planCategories.ts (feature/ai-plan-kategorie) —
// tento modul si ponecháva výhradne vybavenie.

import type { PlanEquipment } from "./planGenerator";

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
