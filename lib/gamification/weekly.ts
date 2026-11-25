// FitPilot — týždenný súhrn klienta „Tvoj týždeň“ (gamifikácia, fáza B). Čisté funkcie
// (testy: e2e/gamification-b.spec.ts). Server (lib/gamification/weeklyServer.ts) ich nakŕmi
// dátami; rovnaký výstup sa dá neskôr použiť aj pre push/e-mail (zatiaľ len v appke).
//
// Pozitívny tón: súhrn nikdy „nevyčíta“ — nesplnený cieľ je len číslo, pokles objemu sa
// nezvýrazňuje a týždeň bez aktivity súhrn vôbec nevytvorí.

import { addDaysIso, diffDays, parseIso, weekStartOf } from "@/lib/reports/period";
import { totalVolumeKg } from "./records";
import { computeRings, type Ring } from "./rings";

/** Súhrn sa ukazuje nedeľu až stredu (potom je týždeň už „starý“). */
const SHOW_DAYS_AFTER_WEEK_END = 3;

/** Pondelok týždňa, ktorý sa sumarizuje: v nedeľu práve končiaci týždeň, inak predchádzajúci. */
export function summaryWeekFor(today: string): string {
  const isSunday = parseIso(today).getUTCDay() === 0;
  return isSunday ? weekStartOf(today) : addDaysIso(weekStartOf(today), -7);
}

/** Má sa súhrn klientovi ukázať? Raz za týždeň (podľa naposledy videného) a len v okne okolo konca týždňa. */
export function isSummaryDue(today: string, seenWeek: string | null | undefined): boolean {
  const week = summaryWeekFor(today);
  if (seenWeek && seenWeek >= week) return false;
  const weekEnd = addDaysIso(week, 6);
  return diffDays(weekEnd, today) <= SHOW_DAYS_AFTER_WEEK_END;
}

export interface WeeklyLog {
  performedOn: string;
  entries?: unknown;
}

export interface WeeklyPr {
  exerciseName: string;
  weightKg: number;
  reps: number | null;
}

export interface WeeklyInput {
  /** pondelok sumarizovaného týždňa */
  weekStart: string;
  logsWeek: WeeklyLog[];
  logsPrev: WeeklyLog[];
  /** dni so zápisom jedla v týždni */
  foodDates: Iterable<string>;
  /** dni v týždni s cieľom bielkovín (0, ak cieľ nie je nastavený) */
  proteinDays: number;
  proteinTarget: number | null;
  /** týždenný cieľ tréningov (dni plánu) */
  workoutTarget: number;
  prs: WeeklyPr[];
  badgeIds: string[];
  challengeNames: string[];
  /** aktuálna séria tréningových týždňov (z rebríčkovej/streak logiky) */
  streakWeeks: number;
}

export type VolumeTrend = "up" | "same" | "down" | "none";

export interface WeeklySummary {
  weekStart: string;
  weekEnd: string;
  workouts: { done: number; target: number; met: boolean };
  rings: Ring[];
  prs: { count: number; top: WeeklyPr[] };
  badgeIds: string[];
  challengeNames: string[];
  volume: { thisKg: number; prevKg: number; deltaPct: number | null; trend: VolumeTrend };
  streakWeeks: number;
  /** false = týždeň bez akejkoľvek aktivity → súhrn sa nezobrazí */
  hasActivity: boolean;
}

export function buildWeeklySummary(i: WeeklyInput): WeeklySummary {
  const weekEnd = addDaysIso(i.weekStart, 6);
  const foodDays = new Set([...i.foodDates].filter((d) => d >= i.weekStart && d <= weekEnd));
  const done = i.logsWeek.length; // každý dokončený tréning (aj viac za deň)
  const target = Math.max(1, i.workoutTarget);

  const thisKg = totalVolumeKg(i.logsWeek.map((l) => ({ entries: l.entries })));
  const prevKg = totalVolumeKg(i.logsPrev.map((l) => ({ entries: l.entries })));
  let deltaPct: number | null = null;
  let trend: VolumeTrend = "none";
  if (prevKg > 0 && thisKg > 0) {
    deltaPct = Math.round(((thisKg - prevKg) / prevKg) * 100);
    trend = deltaPct > 0 ? "up" : deltaPct < 0 ? "down" : "same";
  }

  const topPrs = [...i.prs].sort((a, b) => b.weightKg - a.weightKg).slice(0, 3);
  return {
    weekStart: i.weekStart,
    weekEnd,
    workouts: { done, target, met: done >= target },
    rings: computeRings({
      workoutDays: done,
      workoutTarget: target,
      foodDays: foodDays.size,
      proteinDays: i.proteinDays,
      proteinTarget: i.proteinTarget,
    }),
    prs: { count: i.prs.length, top: topPrs },
    badgeIds: i.badgeIds,
    challengeNames: i.challengeNames,
    volume: { thisKg, prevKg, deltaPct, trend },
    streakWeeks: i.streakWeeks,
    hasActivity: done > 0 || foodDays.size > 0 || i.prs.length > 0 || i.badgeIds.length > 0 || i.challengeNames.length > 0,
  };
}

// ---------------------------------------------------------------- tím trénera

export interface TeamWeekRaw {
  workouts: number;
  activeClients: number;
  prs: number;
  badges: number;
  challengesDone: number;
}

export interface TeamWeek extends TeamWeekRaw {
  /** aktívni klienti trénera */
  totalClients: number;
  /** klienti, ktorí potrebujú pozornosť (meškajú s tréningom) */
  needAttention: number;
  /** tento týždeň sa niečo stalo (inak sa karta ukáže stručnejšie) */
  hasActivity: boolean;
}

export function buildTeamWeek(raw: TeamWeekRaw, totalClients: number, needAttention: number): TeamWeek {
  return {
    ...raw,
    totalClients,
    needAttention,
    hasActivity: raw.workouts > 0 || raw.prs > 0 || raw.badges > 0 || raw.challengesDone > 0,
  };
}
