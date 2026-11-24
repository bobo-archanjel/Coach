// FitPilot — obrazovka „Tréning v číslach“ po ukončení tréningu (gamifikácia v2). Čisté funkcie
// (testy: e2e/gamification-v2.spec.ts). Server súhrn vyrobí z toho, čo sám zapísal a vyhodnotil
// (nikdy z čísel od klienta — okrem voliteľného času štartu), a pošle ho krátkodobou cookie
// (lib/gamification/finishServer.ts), aby sa ukázal aj po obnovení layoutu portálu.
//
// Zásady: len pozitívne („zdvihol si“, „splnil si“), žiadne porovnávanie s cieľom kalórií ani váhou.

import { setsInLog, type MissionKind } from "./missions";
import { totalVolumeKg } from "./records";
import { XP_BADGE, XP_MISSION_BONUS, XP_PR, XP_WORKOUT } from "./xp";
import { badgeById } from "./badges";

/** Najdlhší tréning, ktorý ešte berieme ako skutočný čas (štart z localStorage môže byť starý). */
export const MAX_DURATION_MIN = 360;

export interface FinishMission {
  kind: MissionKind;
  exerciseName?: string;
  value: number;
  goal: number;
  done: boolean;
  /** splnená práve týmto tréningom */
  justDone: boolean;
}

export interface FinishSummary {
  /** minúty (null = čas štartu nie je k dispozícii) */
  durationMin: number | null;
  volumeKg: number;
  sets: number;
  exercises: number;
  prs: number;
  /** získané XP za tento tréning (tréning + rekordy + nové odznaky + misie + bonus) */
  xp: number;
  missions: FinishMission[];
  /** bonus za všetky tri misie týždňa pripísaný práve teraz */
  bonus: boolean;
  /** séria tréningových týždňov a koľko dní chýba do splnenia týždňa */
  streakWeeks: number;
  needThisWeek: number;
  /** v sérii bolo použité zmrazenie */
  freezeUsed: boolean;
  /** nová úroveň, ak tento tréning priniesol postup */
  levelUp: number | null;
  /** pondelok týždňa — pre zdieľaciu kartu týždňa */
  weekStart: string;
}

/** Trvanie v minútach zo štartu (ms od epochy); neplatné/nezmyselné hodnoty → null. */
export function durationMinutes(startedAtMs: unknown, nowMs: number): number | null {
  if (typeof startedAtMs !== "number" || !Number.isFinite(startedAtMs)) return null;
  const min = Math.round((nowMs - startedAtMs) / 60000);
  return min >= 1 && min <= MAX_DURATION_MIN ? min : null;
}

/** Objem, počet sérií a cvikov z odoslaných záznamov tréningu. */
export function workoutNumbers(entries: unknown): { volumeKg: number; sets: number; exercises: number } {
  const list = Array.isArray(entries) ? entries : [];
  return {
    volumeKg: totalVolumeKg([{ entries: list }]),
    sets: setsInLog(list),
    exercises: list.filter((e) => Array.isArray((e as { sets?: unknown })?.sets) && setsInLog([e]) > 0).length,
  };
}

/** XP za tento tréning: tréning + rekordy + nové odznaky (podľa vzácnosti) + splnené misie + bonus týždňa. */
export function xpGained(input: { prs: number; badgeIds: string[]; missionXp: number; bonus: boolean }): number {
  let badges = 0;
  for (const id of new Set(input.badgeIds)) {
    const def = badgeById(id);
    if (def) badges += XP_BADGE[def.rarity];
  }
  return XP_WORKOUT + Math.max(0, input.prs) * XP_PR + badges + Math.max(0, input.missionXp) + (input.bonus ? XP_MISSION_BONUS : 0);
}

// ---------- cookie (krátkodobý prenos zo serverovej akcie do layoutu) ----------

export const FINISH_COOKIE = "fp_finish";
export const FINISH_COOKIE_MAX_AGE_S = 600;

export function encodeFinishSummary(s: FinishSummary): string {
  return encodeURIComponent(JSON.stringify(s));
}

const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : null);
const KINDS: readonly string[] = ["workouts", "food_days", "pr_exercise", "protein_days", "workout_by_wed", "volume", "measurement", "sets"];

/** Bezpečné načítanie z cookie: cudzí / pokazený tvar → null, čísla sa orezávajú do rozumných hraníc. */
export function parseFinishSummary(raw: string | null | undefined): FinishSummary | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>;
    const volumeKg = num(o.volumeKg, 0, 5_000_000);
    const sets = num(o.sets, 0, 2000);
    const exercises = num(o.exercises, 0, 200);
    const prs = num(o.prs, 0, 200);
    const xp = num(o.xp, 0, 100_000);
    const streakWeeks = num(o.streakWeeks, 0, 60);
    const needThisWeek = num(o.needThisWeek, 0, 7);
    if (volumeKg == null || sets == null || exercises == null || prs == null || xp == null || streakWeeks == null || needThisWeek == null) return null;
    const weekStart = typeof o.weekStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.weekStart) ? o.weekStart : null;
    if (!weekStart) return null;
    const missions: FinishMission[] = [];
    for (const m of Array.isArray(o.missions) ? o.missions.slice(0, 3) : []) {
      const r = m as Record<string, unknown>;
      const value = num(r.value, 0, 1_000_000);
      const goal = num(r.goal, 1, 1_000_000);
      if (typeof r.kind !== "string" || !KINDS.includes(r.kind) || value == null || goal == null) continue;
      missions.push({
        kind: r.kind as MissionKind,
        ...(typeof r.exerciseName === "string" ? { exerciseName: r.exerciseName.slice(0, 80) } : {}),
        value,
        goal,
        done: r.done === true,
        justDone: r.justDone === true,
      });
    }
    return {
      durationMin: o.durationMin == null ? null : num(o.durationMin, 1, MAX_DURATION_MIN),
      volumeKg,
      sets,
      exercises,
      prs,
      xp,
      missions,
      bonus: o.bonus === true,
      streakWeeks,
      needThisWeek,
      freezeUsed: o.freezeUsed === true,
      levelUp: o.levelUp == null ? null : num(o.levelUp, 1, 60),
      weekStart,
    };
  } catch {
    return null;
  }
}
