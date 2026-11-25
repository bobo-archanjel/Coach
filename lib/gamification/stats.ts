// FitPilot — štatistiky pre odznaky a karta Dnes (gamifikácia, fáza A). Čisté funkcie:
// server ich len nakŕmi načítanými riadkami (lib/gamification/server.ts).

import { weeklyTarget } from "@/lib/reports/aggregate";
import { TRAINING_WEEK_TARGET } from "@/lib/portal/streak";
import { addDaysIso, weekStartOf } from "@/lib/reports/period";
import {
  bestFoodStreakDays,
  bestTrainingStreakWeeks,
  countMondayWeeks,
  countTimeOfDay,
  countWeekendDoubles,
  hasChristmasWorkout,
  hasComeback,
  hasCompletedPlan,
  hasEasterWeekWorkout,
  hasNewYearWorkout,
  hasProteinWeek,
  normalizeBadgeIds,
  type BadgeStats,
  type NextBadge,
  BADGES,
  EMPTY_BADGE_STATS,
  nextBadges,
} from "./badges";
import { exerciseKeyOf, totalVolumeKg } from "./records";
import type { LoggedEntry } from "@/lib/reports/aggregate";
import { proteinMet, type DailyRing } from "./rings";
import { computeXp, levelDetail, levelFor, type LevelDetail, type LevelInfo, type XpBreakdown } from "./xp";

/** Čo karta Dnes potrebuje zo stavu dňa (podmnožina TodayRingState z ringsServer.ts — štruktúrne zhodná). */
export interface TodayRings {
  rings: DailyRing[];
  restAvailable: boolean;
  restToday: boolean;
  workoutToday: boolean;
}

export interface StatsLog {
  id: string;
  performedOn: string;
  workoutDayId: string | null;
  entries: unknown;
  /** čas dokončenia (workout_logs.completed_at) — pre Nočnú sovu / Ranné vtáča */
  completedAt?: string | null;
}

/** Počet rôznych cvikov (podľa normalizovaného názvu) naprieč tréningami. */
export function countDistinctExercises(logs: { entries: unknown }[]): number {
  const keys = new Set<string>();
  for (const log of logs) {
    for (const e of Array.isArray(log.entries) ? (log.entries as LoggedEntry[]) : []) {
      const name = typeof e?.name === "string" ? e.name.trim() : "";
      if (name) keys.add(exerciseKeyOf(name));
    }
  }
  return keys.size;
}

export interface StatsInput {
  logs: StatsLog[];
  prCount: number;
  /** súčet bielkovín po dňoch (len dni so zápisom) */
  foodDaily: { date: string; protein: number }[];
  proteinTarget: number | null;
  bodyMetricCount: number;
  /** plány klienta s ID ich dní */
  plans: { dayIds: string[] }[];
  /** týždenný cieľ tréningov (z počtu dní aktívneho plánu) */
  weeklyTarget: number;
  today: string;
}

export function computeBadgeStats(i: StatsInput): BadgeStats {
  const trainedDates = [...new Set(i.logs.map((l) => l.performedOn))];
  const doneDayIds = new Set(i.logs.map((l) => l.workoutDayId).filter((d): d is string => !!d));
  const metDates = i.foodDaily.filter((d) => proteinMet(d.protein, i.proteinTarget)).map((d) => d.date);
  const timeOfDay = countTimeOfDay(i.logs.map((l) => l.completedAt));
  return {
    workoutCount: i.logs.length,
    bestTrainingStreakWeeks: bestTrainingStreakWeeks(trainedDates, i.today, i.weeklyTarget),
    prCount: i.prCount,
    totalVolumeKg: totalVolumeKg(i.logs),
    bestFoodStreakDays: bestFoodStreakDays(i.foodDaily.map((d) => d.date), i.today),
    proteinWeek: hasProteinWeek(metDates),
    bodyMetricCount: i.bodyMetricCount,
    planAllDaysDone: hasCompletedPlan(i.plans, doneDayIds),
    newYearWorkout: hasNewYearWorkout(trainedDates),
    nightWorkouts: timeOfDay.night,
    earlyWorkouts: timeOfDay.early,
    weekendDoubles: countWeekendDoubles(trainedDates),
    comeback: hasComeback(trainedDates),
    maxWorkoutVolumeKg: i.logs.reduce((m, l) => Math.max(m, totalVolumeKg([l])), 0),
    distinctExercises: countDistinctExercises(i.logs),
    mondayWeeks: countMondayWeeks(trainedDates),
    easterWeekWorkout: hasEasterWeekWorkout(trainedDates),
    christmasWorkout: hasChristmasWorkout(trainedDates),
  };
}

/** Cieľ týždňa z počtu dní aktívneho plánu (1–7), bez plánu predvolený (rovnako ako reporty). */
export function ringTarget(planDays: number | null | undefined): number {
  return weeklyTarget(planDays, TRAINING_WEEK_TARGET);
}

// ---------- karta Dnes ----------

/** Surové čísla z DB pre kartu Dnes (XP a odznaky; denné prstence idú zo stavu dňa — lib/gamification/ringsServer.ts). */
export interface GamificationRaw {
  workouts: number;
  foodDays: number;
  prCount: number;
  badgeIds: string[];
  /** XP zo splnených týždenných misií vrátane bonusov (0 bez migrácie 0084) */
  missionXp?: number;
  /** XP za dni s uzavretými denými prstencami (0 bez migrácie 0087) */
  ringXp?: number;
}

/** Stav tlačidla „Dnes oddychujem“ na karte Dnes. */
export interface RestState {
  /** tabuľka client_rest_days existuje (0087) */
  available: boolean;
  /** dnes je označený odpočinok */
  active: boolean;
  /** dnes je dokončený tréning — tlačidlo sa neukazuje */
  workoutToday: boolean;
}

export interface GamificationHome {
  /** denné prstence (Strava, Bielkoviny, Pohyb); prázdne, keď sa dnešné dáta nepodarilo načítať */
  rings: DailyRing[];
  /** týždenný pohľad pod prstencami („Tento týždeň: 2/3 tréningy“) — série sú týždenné */
  week: { done: number; target: number };
  rest: RestState;
  xp: XpBreakdown;
  /** skupina Bronz…Diamant (kompatibilita) */
  level: LevelInfo;
  /** 20 úrovní s titulom */
  detail: LevelDetail;
  badgeCount: number;
  badgeTotal: number;
  /** najbližšie odznaky („Ešte 3 tréningy do …“) — z údajov, ktoré karta Dnes má (tréningy a rekordy) */
  next: NextBadge[];
}

/** Karta Dnes: denné prstence + týždenný riadok tréningov + úroveň. Dni tréningu berie z dátumov, ktoré portál načítal pre série. */
export function buildGamificationHome(
  raw: GamificationRaw,
  ctx: { planDays: number | null | undefined; trainedDates: Iterable<string>; today: string; daily: TodayRings | null },
): GamificationHome {
  const monday = weekStartOf(ctx.today);
  const sunday = addDaysIso(monday, 6);
  const inWeek = (d: string) => d >= monday && d <= sunday;
  const workoutDays = new Set([...ctx.trainedDates].filter(inWeek)).size;
  const xp = computeXp({ workouts: raw.workouts, foodDays: raw.foodDays, prs: raw.prCount, badgeIds: raw.badgeIds, missionXp: raw.missionXp, ringXp: raw.ringXp });
  return {
    rings: ctx.daily?.rings ?? [],
    week: { done: workoutDays, target: ringTarget(ctx.planDays) },
    rest: { available: ctx.daily?.restAvailable ?? false, active: ctx.daily?.restToday ?? false, workoutToday: ctx.daily?.workoutToday ?? false },
    xp,
    level: levelFor(xp.total),
    detail: levelDetail(xp.total),
    badgeCount: normalizeBadgeIds(raw.badgeIds).size,
    badgeTotal: BADGES.length,
    next: nextBadges(
      { ...EMPTY_BADGE_STATS, workoutCount: raw.workouts, prCount: raw.prCount },
      new Set(raw.badgeIds),
      1,
      (b) => b.family === "workouts" || b.family === "prs",
    ),
  };
}

/** Súčty bielkovín po dňoch z riadkov food_logs (gramáž × bielkoviny na 100 g). */
export function proteinByDay(rows: { eaten_on: string; grams: number; protein_100g: number }[]): { date: string; protein: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.eaten_on, (map.get(r.eaten_on) ?? 0) + (r.grams * r.protein_100g) / 100);
  return [...map].map(([date, protein]) => ({ date, protein }));
}
