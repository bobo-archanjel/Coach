// FitPilot — týždenné prstence na karte Dnes (gamifikácia, fáza A). Čisté funkcie.
//
// Tri prstence za AKTUÁLNY týždeň (pondelok–nedeľa):
//  1. tréning  — odlišné tréningové dni / cieľ (počet dní aktívneho plánu 1–7, predvolene 2:
//                rovnaké pravidlo ako reporty, weeklyTarget z lib/reports/aggregate.ts),
//  2. jedlo    — dni so zapísanou aspoň jednou položkou / 7. Plní sa voči 7 (nie voči
//                uplynutým dňom), aby prstenec v pondelok nepôsobil „hotovo“ a aby bol
//                rovnaký všetky dni; text ukazuje „x/7“. Žiadne trafenie kalórií.
//  3. bielkoviny — dni, v ktorých klient dosiahol aspoň 90 % cieľa bielkovín (viac je v poriadku,
//                  teda „±10 % alebo viac“). Bez cieľa v nutrition_profiles sa prstenec skryje.

import { addDaysIso } from "@/lib/reports/period";

export type RingId = "training" | "food" | "protein";

export interface Ring {
  id: RingId;
  value: number;
  goal: number;
  /** 0–1 (orezané) */
  fraction: number;
  done: boolean;
}

/** Podiel cieľa bielkovín, od ktorého sa deň počíta ako splnený. */
export const PROTEIN_MET_RATIO = 0.9;

export function proteinMet(proteinG: number, target: number | null | undefined): boolean {
  return target != null && target > 0 && proteinG >= target * PROTEIN_MET_RATIO - 1e-9;
}

/** Počet dní v rozsahu <from, to>, v ktorých bol cieľ bielkovín splnený. */
export function proteinDaysMet(
  daily: Iterable<[string, number]>,
  target: number | null | undefined,
  from: string,
  to: string,
): number {
  let n = 0;
  for (const [date, protein] of daily) {
    if (date >= from && date <= to && proteinMet(protein, target)) n++;
  }
  return n;
}

export interface RingInput {
  workoutDays: number;
  workoutTarget: number;
  foodDays: number;
  proteinDays: number;
  proteinTarget: number | null;
}

function ring(id: RingId, value: number, goal: number): Ring {
  const safeGoal = Math.max(1, goal);
  const v = Math.max(0, value);
  return { id, value: v, goal: safeGoal, fraction: Math.min(1, v / safeGoal), done: v >= safeGoal };
}

/** Prstence v poradí tréning, jedlo, bielkoviny (posledný len pri nastavenom cieli). */
export function computeRings(input: RingInput): Ring[] {
  const rings = [ring("training", input.workoutDays, input.workoutTarget), ring("food", Math.min(7, input.foodDays), 7)];
  if (input.proteinTarget != null && input.proteinTarget > 0) rings.push(ring("protein", Math.min(7, input.proteinDays), 7));
  return rings;
}

/** Dni <monday, monday+6>. */
export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysIso(monday, i));
}
