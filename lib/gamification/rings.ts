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

// ---------- denné prstence (karta Dnes) ----------
// Reset každý deň (hranica dňa Europe/Bratislava — dátum dňa dodáva volajúci, tu sa nerátajú časové pásma).
//  1. Strava      — počet RÔZNYCH jedál dňa (meal_slot) / cieľ = počet jedál za deň v aktívnom jedálničku
//                   (bez neho 3); uzavretý pri value >= cieľ,
//  2. Bielkoviny  — bielkoviny dnes / cieľ z nutrition_profiles; uzavretý od 90 % (viac je v poriadku).
//                   Bez cieľa sa prstenec skryje,
//  3. Pohyb       — uzavretý, ak klient dnes dokončil tréning ALEBO klikol „Dnes oddychujem“ (aktívny odpočinok).
//                   Odpočinok je zámerne len vstup tohto jedného prstenca: do sérií, misií, odznakov ani reportov
//                   nevstupuje (tie čítajú workout_logs, nie client_rest_days).
// Žiadne odmeny za trafenie kalórií, len pozitívne správy.

export type DailyRingId = "meals" | "protein" | "move";

export interface DailyRing {
  id: DailyRingId;
  value: number;
  goal: number;
  /** 0–1 (orezané); bielkoviny sa plnia voči 90 % cieľa, aby bol prstenec plný presne pri uzavretí */
  fraction: number;
  done: boolean;
  /** len Pohyb: čo ho zatvorilo */
  via?: "workout" | "rest" | null;
}

/** Predvolený počet jedál za deň, keď klient nemá jedálniček. */
export const DEFAULT_MEAL_TARGET = 3;
/** meal_slot má 6 hodnôt (raňajky … iné) — viac jedál za deň sa nedá zapísať ako rôzne. */
export const MAX_MEAL_TARGET = 6;
/** XP za deň s uzavretými všetkými viditeľnými prstencami (raz za deň). */
export const XP_RINGS_DAY = 10;

/**
 * Cieľ jedál za deň z aktívneho jedálnička: `slotCounts` = počet rôznych jedál (slotov) v každom dni plánu.
 * Berie sa dolný medián neprázdnych dní (klient nevie, ktorý deň plánu práve drží, takže cieľ nesmie byť
 * nesplniteľný kvôli najhustejšiemu dňu); bez jedálnička 3. Orezané na 1–6.
 */
export function mealTargetFromPlan(slotCounts: readonly number[] | null | undefined): number {
  const counts = (slotCounts ?? []).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (counts.length === 0) return DEFAULT_MEAL_TARGET;
  const median = counts[Math.floor((counts.length - 1) / 2)];
  return Math.min(MAX_MEAL_TARGET, Math.max(1, Math.floor(median)));
}

export interface DailyRingInput {
  /** počet rôznych jedál (meal_slot) zapísaných dnes */
  mealSlots: number;
  mealTarget?: number | null;
  proteinG: number;
  proteinTarget: number | null | undefined;
  workoutToday: boolean;
  /** počet dnešných dokončených tréningov (Pohyb ukáže 2/1, 3/1); bez neho 1 pri workoutToday */
  workoutsToday?: number;
  restToday: boolean;
}

/** Denné prstence v poradí Pohyb, Bielkoviny (len pri cieli), Strava. */
export function computeDailyRings(i: DailyRingInput): DailyRing[] {
  const mealGoal = Math.min(MAX_MEAL_TARGET, Math.max(1, Math.floor(i.mealTarget ?? DEFAULT_MEAL_TARGET)));
  const mealValue = Math.min(mealGoal, Math.max(0, Math.floor(i.mealSlots)));
  const moved = i.workoutToday || i.restToday;
  // viac tréningov za deň: hodnota = počet tréningov (2/1, 3/1), prstenec je plný už pri prvom
  const workouts = i.workoutToday ? Math.max(1, Math.floor(i.workoutsToday ?? 1)) : 0;
  const rings: DailyRing[] = [
    {
      id: "move",
      value: workouts > 0 ? workouts : moved ? 1 : 0,
      goal: 1,
      fraction: moved ? 1 : 0,
      done: moved,
      via: i.workoutToday ? "workout" : i.restToday ? "rest" : null,
    },
  ];
  const target = i.proteinTarget;
  if (target != null && target > 0) {
    const protein = Math.max(0, i.proteinG);
    rings.push({
      id: "protein",
      value: Math.round(protein),
      goal: Math.round(target),
      fraction: Math.min(1, protein / (target * PROTEIN_MET_RATIO)),
      done: proteinMet(protein, target),
    });
  }
  rings.push({ id: "meals", value: mealValue, goal: mealGoal, fraction: mealValue / mealGoal, done: mealValue >= mealGoal });
  return rings;
}

/** Všetky viditeľné prstence uzavreté (aspoň jeden musí existovať). */
export function allRingsClosed(rings: readonly { done: boolean }[]): boolean {
  return rings.length > 0 && rings.every((r) => r.done);
}

/** Oslava „Všetky kruhy uzavreté!“ sa ukáže raz za deň: zatvorené a ešte neoslávené dnes. */
export function celebrationDue(rings: readonly { done: boolean }[], celebratedOn: string | null | undefined, today: string): boolean {
  return allRingsClosed(rings) && celebratedOn !== today;
}

/** XP za uzavreté dni (deterministicky z počtu dní, nikdy z klienta). */
export function ringsXp(closedDays: number): number {
  return Math.max(0, Math.floor(closedDays)) * XP_RINGS_DAY;
}

/** Zatvorí odpočinok prstenec Pohyb? Odpočinok platí len bez dnešného tréningu (tlačidlo sa inak neukazuje). */
export function canMarkRest(workoutToday: boolean): boolean {
  return !workoutToday;
}

const KNOWN_SLOTS = new Set(["ranajky", "desiata", "obed", "olovrant", "vecera", "ine"]);

/** Počet rôznych jedál (meal_slot) v zozname položiek dňa — pre jedálniček aj dnešné zápisy. Neznáme sloty sa ignorujú. */
export function distinctMealSlots(items: unknown): number {
  if (!Array.isArray(items)) return 0;
  const slots = new Set<string>();
  for (const it of items) {
    const slot = (it as { meal_slot?: unknown } | null)?.meal_slot;
    if (typeof slot === "string" && KNOWN_SLOTS.has(slot)) slots.add(slot);
  }
  return slots.size;
}

/** Dnešné zápisy jedla → počet jedál a súčet bielkovín (gramáž × bielkoviny na 100 g). */
export function summarizeTodayFood(rows: { meal_slot: string; grams: number | string; protein_100g: number | string }[]): { mealSlots: number; proteinG: number } {
  let protein = 0;
  for (const r of rows) protein += (Number(r.grams) * Number(r.protein_100g)) / 100 || 0;
  return { mealSlots: distinctMealSlots(rows), proteinG: protein };
}
