// FitPilot — katalóg odznakov klienta (gamifikácia, fáza A). Čisté funkcie, žiadna DB.
// Texty (názov, popis) sú v messages/<jazyk>/gamification.json pod `badges.<id>.name|desc`,
// tu sú len kľúče, ikona a pravidlo.
//
// Zásady (rovnaké ako lib/portal/streak.ts):
//  - tréning po TÝŽDŇOCH, jedlo po DNIACH so zápisom aspoň jednej položky,
//  - nikdy odznak za trafenie kalórií alebo chudnutie,
//  - jedno vynechanie sa toleruje (runLength zo streak.ts), pozitívne a bez hanenia.
//
// Idempotencia: `missingBadges(stats, owned)` vráti len odznaky, ktoré sú splnené a ešte
// nie sú pripísané — server ich vloží s UNIQUE (client_id, badge_id), takže opakované
// vyhodnotenie nič nezdvojí.

import { addDaysIso, diffDays, weekStartOf } from "@/lib/reports/period";
import { runLength } from "@/lib/portal/streak";

export type BadgeCategory = "endurance" | "strength" | "nutrition" | "progress" | "hidden";
export type BadgeRarity = "common" | "rare" | "epic";
/** Čo na zápise môže odznak zmeniť — podľa toho server vie, ktoré dáta načítať. */
export type BadgeTrigger = "workout" | "food" | "body";
export type BadgeIcon = "spark" | "dumbbell" | "flame" | "trophy" | "weight" | "leaf" | "ruler" | "map" | "star";

export interface BadgeStats {
  /** dokončené tréningy (workout_logs) */
  workoutCount: number;
  /** najdlhšia séria tréningových týždňov (s toleranciou jedného vynechania) */
  bestTrainingStreakWeeks: number;
  /** počet osobných rekordov */
  prCount: number;
  /** celkový objem v kg (kg × opakovania) */
  totalVolumeKg: number;
  /** najdlhšia séria dní so zapísaným jedlom */
  bestFoodStreakDays: number;
  /** existuje týždeň s cieľom bielkovín splneným aspoň 5 dní */
  proteinWeek: boolean;
  /** počet meraní tela */
  bodyMetricCount: number;
  /** existuje plán (aspoň 2 dni), ktorého každý deň klient aspoň raz odcvičil */
  planAllDaysDone: boolean;
  /** tréning 31. 12. alebo 1. 1. */
  newYearWorkout: boolean;
}

export const EMPTY_BADGE_STATS: BadgeStats = {
  workoutCount: 0,
  bestTrainingStreakWeeks: 0,
  prCount: 0,
  totalVolumeKg: 0,
  bestFoodStreakDays: 0,
  proteinWeek: false,
  bodyMetricCount: 0,
  planAllDaysDone: false,
  newYearWorkout: false,
};

export interface BadgeDef {
  id: string;
  category: BadgeCategory;
  icon: BadgeIcon;
  rarity: BadgeRarity;
  /** skrytý odznak ukazuje „???“, kým ho klient nezíska */
  hidden?: boolean;
  trigger: BadgeTrigger;
  rule: (s: BadgeStats) => boolean;
  /** pre galériu: hodnota a cieľ (pásik postupu); chýba pri odznakoch typu áno/nie */
  progress?: (s: BadgeStats) => { value: number; goal: number };
}

const atLeast = (pick: (s: BadgeStats) => number, goal: number) => ({
  rule: (s: BadgeStats) => pick(s) >= goal,
  progress: (s: BadgeStats) => ({ value: Math.min(pick(s), goal), goal }),
});

const workouts = (id: string, goal: number, rarity: BadgeRarity, icon: BadgeIcon): BadgeDef => ({
  id,
  category: "endurance",
  icon,
  rarity,
  trigger: "workout",
  ...atLeast((s) => s.workoutCount, goal),
});
const streak = (id: string, weeks: number, rarity: BadgeRarity): BadgeDef => ({
  id,
  category: "endurance",
  icon: "flame",
  rarity,
  trigger: "workout",
  ...atLeast((s) => s.bestTrainingStreakWeeks, weeks),
});
const volume = (id: string, tons: number, rarity: BadgeRarity): BadgeDef => ({
  id,
  category: "strength",
  icon: "weight",
  rarity,
  trigger: "workout",
  ...atLeast((s) => s.totalVolumeKg, tons * 1000),
});
const foodStreak = (id: string, days: number, rarity: BadgeRarity): BadgeDef => ({
  id,
  category: "nutrition",
  icon: "leaf",
  rarity,
  trigger: "food",
  ...atLeast((s) => s.bestFoodStreakDays, days),
});

/**
 * Katalóg. Poradie = poradie v galérii. „Ranné vtáča“ (5 tréningov pred 7:00) sa
 * nezavádza: workout_logs ukladá len čas ukončenia (completed_at), nie začiatku.
 */
export const BADGES: readonly BadgeDef[] = [
  // Vytrvalosť
  workouts("first_workout", 1, "common", "spark"),
  workouts("workouts_10", 10, "common", "dumbbell"),
  workouts("workouts_25", 25, "common", "dumbbell"),
  workouts("workouts_50", 50, "rare", "dumbbell"),
  workouts("workouts_100", 100, "rare", "dumbbell"),
  workouts("workouts_250", 250, "epic", "dumbbell"),
  streak("streak_4w", 4, "common"),
  streak("streak_12w", 12, "rare"),
  streak("streak_26w", 26, "epic"),
  streak("streak_52w", 52, "epic"),
  // Sila
  { id: "first_pr", category: "strength", icon: "trophy", rarity: "common", trigger: "workout", ...atLeast((s) => s.prCount, 1) },
  { id: "prs_10", category: "strength", icon: "trophy", rarity: "rare", trigger: "workout", ...atLeast((s) => s.prCount, 10) },
  volume("volume_1t", 1, "common"),
  volume("volume_10t", 10, "rare"),
  volume("volume_50t", 50, "epic"),
  volume("volume_100t", 100, "epic"),
  // Strava
  foodStreak("food_streak_7", 7, "common"),
  foodStreak("food_streak_30", 30, "rare"),
  { id: "protein_week", category: "nutrition", icon: "leaf", rarity: "rare", trigger: "food", rule: (s) => s.proteinWeek },
  // Progres
  {
    id: "first_measurement",
    category: "progress",
    icon: "ruler",
    rarity: "common",
    trigger: "body",
    ...atLeast((s) => s.bodyMetricCount, 1),
  },
  { id: "plan_all_days", category: "progress", icon: "map", rarity: "rare", trigger: "workout", rule: (s) => s.planAllDaysDone },
  // Skryté
  { id: "new_year", category: "hidden", icon: "star", rarity: "rare", hidden: true, trigger: "workout", rule: (s) => s.newYearWorkout },
];

export const BADGE_CATEGORIES: readonly BadgeCategory[] = ["endurance", "strength", "nutrition", "progress", "hidden"];

const BY_ID = new Map(BADGES.map((b) => [b.id, b]));
export function badgeById(id: string): BadgeDef | undefined {
  return BY_ID.get(id);
}

/** Splnené odznaky podľa štatistík (bez ohľadu na to, či už sú pripísané). */
export function satisfiedBadges(stats: BadgeStats): string[] {
  return BADGES.filter((b) => b.rule(stats)).map((b) => b.id);
}

/** Splnené a ešte nepripísané — to je celé „idempotentné pripisovanie“. */
export function missingBadges(stats: BadgeStats, owned: ReadonlySet<string>, triggers?: readonly BadgeTrigger[]): string[] {
  return BADGES.filter((b) => (!triggers || triggers.includes(b.trigger)) && !owned.has(b.id) && b.rule(stats)).map((b) => b.id);
}

/** Odznaky, ktoré ešte nie sú pripísané — server podľa nich vie, či má vôbec načítať dáta. */
export function unownedBadges(owned: ReadonlySet<string>, trigger: BadgeTrigger): BadgeDef[] {
  return BADGES.filter((b) => b.trigger === trigger && !owned.has(b.id));
}

/** Skrytý odznak sa odhalí až po získaní; ostatné sú viditeľné vždy. */
export function isBadgeRevealed(def: BadgeDef, earned: boolean): boolean {
  return !def.hidden || earned;
}

/** Odznaky pre galériu po kategóriách: získané (s dátumom) aj zamknuté, skryté zamknuté bez prezradenia. */
export interface BadgeView {
  id: string;
  category: BadgeCategory;
  icon: BadgeIcon;
  rarity: BadgeRarity;
  earned: boolean;
  earnedOn: string | null;
  /** false = v UI „???“ namiesto názvu a popisu */
  revealed: boolean;
}

export function buildBadgeViews(earnedOn: ReadonlyMap<string, string>): BadgeView[] {
  return BADGES.map((b) => {
    const date = earnedOn.get(b.id) ?? null;
    return {
      id: b.id,
      category: b.category,
      icon: b.icon,
      rarity: b.rarity,
      earned: date != null,
      earnedOn: date,
      revealed: isBadgeRevealed(b, date != null),
    };
  });
}

// ---------- najdlhšie série z histórie (pre odznaky; aktuálna séria je v streak.ts) ----------

/**
 * Najdlhšia séria z chronologického poľa „splnená jednotka?“ (od najstaršej) — rovnaké
 * pravidlá ako runLength (jedno vynechanie sa toleruje). Okno 120 jednotiek stačí na
 * odznaky do 52 týždňov / 30 dní.
 */
export function bestRun(chronological: boolean[], window = 120): number {
  let best = 0;
  for (let i = 0; i < chronological.length; i++) {
    if (!chronological[i]) continue;
    const back: boolean[] = [];
    for (let k = i; k >= 0 && back.length < window; k--) back.push(chronological[k]);
    best = Math.max(best, runLength(back).count);
  }
  return best;
}

/** Najdlhšia séria tréningových týždňov (≥ `target` odlišných dní v týždni). */
export function bestTrainingStreakWeeks(trainedDates: Iterable<string>, today: string, target: number): number {
  const daysByWeek = new Map<string, Set<string>>();
  let earliest = today;
  for (const d of trainedDates) {
    if (d < earliest) earliest = d;
    const week = weekStartOf(d);
    const set = daysByWeek.get(week) ?? new Set<string>();
    set.add(d);
    daysByWeek.set(week, set);
  }
  const first = weekStartOf(earliest);
  const weeks = Math.floor(diffDays(first, weekStartOf(today)) / 7) + 1;
  const chrono: boolean[] = [];
  for (let k = 0; k < weeks; k++) chrono.push((daysByWeek.get(addDaysIso(first, 7 * k))?.size ?? 0) >= target);
  return bestRun(chrono);
}

/** Najdlhšia séria dní so zapísaným jedlom. */
export function bestFoodStreakDays(foodDates: Iterable<string>, today: string): number {
  const set = new Set(foodDates);
  if (set.size === 0) return 0;
  const first = [...set].sort()[0];
  const days = diffDays(first, today) + 1;
  const chrono: boolean[] = [];
  for (let k = 0; k < days; k++) chrono.push(set.has(addDaysIso(first, k)));
  return bestRun(chrono);
}

/** Existuje týždeň (po–ne), v ktorom bolo aspoň 5 dní s cieľom bielkovín splneným? */
export function hasProteinWeek(metDates: Iterable<string>, minDays = 5): boolean {
  const byWeek = new Map<string, number>();
  for (const d of new Set(metDates)) {
    const w = weekStartOf(d);
    byWeek.set(w, (byWeek.get(w) ?? 0) + 1);
  }
  return [...byWeek.values()].some((n) => n >= minDays);
}

/** Tréning 31. 12. alebo 1. 1. (ktorýkoľvek rok). */
export function hasNewYearWorkout(trainedDates: Iterable<string>): boolean {
  for (const d of trainedDates) {
    const md = d.slice(5, 10);
    if (md === "12-31" || md === "01-01") return true;
  }
  return false;
}

/** Plán (aspoň 2 dni), ktorého každý deň má aspoň jeden zápis. */
export function hasCompletedPlan(plans: { dayIds: string[] }[], doneDayIds: ReadonlySet<string>): boolean {
  return plans.some((p) => p.dayIds.length >= 2 && p.dayIds.every((id) => doneDayIds.has(id)));
}
