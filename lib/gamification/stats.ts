// FitPilot — štatistiky pre odznaky a karta Dnes (gamifikácia, fáza A). Čisté funkcie:
// server ich len nakŕmi načítanými riadkami (lib/gamification/server.ts).

import { weeklyTarget } from "@/lib/reports/aggregate";
import { TRAINING_WEEK_TARGET } from "@/lib/portal/streak";
import { addDaysIso, weekStartOf } from "@/lib/reports/period";
import {
  bestFoodStreakDays,
  bestTrainingStreakWeeks,
  hasCompletedPlan,
  hasNewYearWorkout,
  hasProteinWeek,
  type BadgeStats,
  BADGES,
} from "./badges";
import { totalVolumeKg } from "./records";
import { computeRings, proteinMet, type Ring } from "./rings";
import { computeXp, levelFor, type LevelInfo, type XpBreakdown } from "./xp";

export interface StatsLog {
  id: string;
  performedOn: string;
  workoutDayId: string | null;
  entries: unknown;
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
  };
}

/** Cieľ týždňa z počtu dní aktívneho plánu (1–7), bez plánu predvolený (rovnako ako reporty). */
export function ringTarget(planDays: number | null | undefined): number {
  return weeklyTarget(planDays, TRAINING_WEEK_TARGET);
}

// ---------- karta Dnes ----------

/** Surové čísla z DB pre kartu Dnes (server → čistá funkcia nižšie). */
export interface GamificationRaw {
  workouts: number;
  foodDays: number;
  prCount: number;
  badgeIds: string[];
  proteinTarget: number | null;
  /** zápisy jedla aktuálneho týždňa po dňoch */
  weekFood: { date: string; protein: number }[];
}

export interface GamificationHome {
  rings: Ring[];
  xp: XpBreakdown;
  level: LevelInfo;
  badgeCount: number;
  badgeTotal: number;
}

/** Karta Dnes: prstence týždňa + úroveň. Dni tréningu/jedla berie z dátumov, ktoré portál načítal pre série. */
export function buildGamificationHome(
  raw: GamificationRaw,
  ctx: { planDays: number | null | undefined; trainedDates: Iterable<string>; foodDates: Iterable<string>; today: string },
): GamificationHome {
  const monday = weekStartOf(ctx.today);
  const sunday = addDaysIso(monday, 6);
  const inWeek = (d: string) => d >= monday && d <= sunday;
  const workoutDays = new Set([...ctx.trainedDates].filter(inWeek)).size;
  const foodDays = new Set([...ctx.foodDates].filter(inWeek)).size;
  const proteinDays = new Set(
    raw.weekFood.filter((d) => inWeek(d.date) && proteinMet(d.protein, raw.proteinTarget)).map((d) => d.date),
  ).size;
  const xp = computeXp({ workouts: raw.workouts, foodDays: raw.foodDays, prs: raw.prCount, badgeIds: raw.badgeIds });
  return {
    rings: computeRings({
      workoutDays,
      workoutTarget: ringTarget(ctx.planDays),
      foodDays,
      proteinDays,
      proteinTarget: raw.proteinTarget,
    }),
    xp,
    level: levelFor(xp.total),
    badgeCount: new Set(raw.badgeIds).size,
    badgeTotal: BADGES.length,
  };
}

/** Súčty bielkovín po dňoch z riadkov food_logs (gramáž × bielkoviny na 100 g). */
export function proteinByDay(rows: { eaten_on: string; grams: number; protein_100g: number }[]): { date: string; protein: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.eaten_on, (map.get(r.eaten_on) ?? 0) + (r.grams * r.protein_100g) / 100);
  return [...map].map(([date, protein]) => ({ date, protein }));
}
