import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeTrainingStreak, TRAINING_WEEK_TARGET } from "@/lib/portal/streak";
import { addDaysIso, weekStartOf } from "@/lib/reports/period";
import {
  FINISH_COOKIE,
  FINISH_COOKIE_MAX_AGE_S,
  durationMinutes,
  encodeFinishSummary,
  parseFinishSummary,
  workoutNumbers,
  xpGained,
  type FinishMission,
  type FinishSummary,
} from "./finishSummary";
import { resolveFreezes } from "./freezesServer";
import { MISSION_KINDS_BY_TRIGGER } from "./missionsServer";
import type { SyncReport } from "./server";

// FitPilot — „Tréning v číslach“, serverová časť. Súhrn sa po ukončení tréningu vyrobí z toho, čo server sám
// zapísal a vyhodnotil (rekordy, odznaky, misie, séria), a uloží sa do krátkodobej cookie (10 min, httpOnly) —
// layout portálu ho po obnovení ukáže raz a klient ho zavrie (clearFinishSummaryAction). Číslo od klienta
// sa berie len pre čas štartu (a aj ten sa overí: 1–360 min).

type Sb = SupabaseClient;

/** Séria tréningových týždňov po tréningu (s automatickým použitím zmrazenia, ak by sa séria pretrhla). */
export async function loadTrainingStreakStatus(
  supabase: Sb,
  clientId: string,
  today: string,
): Promise<{ weeks: number; needThisWeek: number; freezeUsed: boolean }> {
  try {
    const monday = weekStartOf(today);
    const { data } = await supabase
      .from("workout_logs")
      .select("performed_on")
      .eq("client_id", clientId)
      .eq("status", "completed")
      .gte("performed_on", addDaysIso(monday, -7 * 51))
      .limit(2000);
    const dates = (data ?? []).map((r) => r.performed_on as string);
    const before = await resolveFreezes(supabase, clientId, { trainedDates: dates, foodDates: [], today, trainingTarget: TRAINING_WEEK_TARGET });
    const streak = computeTrainingStreak(dates, today, TRAINING_WEEK_TARGET, before.frozenWeeks);
    // zmrazenie „použité práve teraz“ = jeho použitie je z dnešného dňa
    const freezeUsed = before.uses.some((u) => u.kind === "week" && u.usedAt.slice(0, 10) === today);
    return { weeks: streak.count, needThisWeek: streak.needThisWeek, freezeUsed };
  } catch {
    return { weeks: 0, needThisWeek: 0, freezeUsed: false };
  }
}

/** Poskladá súhrn z výsledku synchronizácie a odoslaných záznamov tréningu. */
export async function buildFinishSummary(
  supabase: Sb,
  input: { clientId: string; entries: unknown; startedAtMs: unknown; report: SyncReport; today: string },
): Promise<FinishSummary> {
  const { report } = input;
  const nums = workoutNumbers(input.entries);
  const missions = report.missions;
  const workoutKinds = new Set(MISSION_KINDS_BY_TRIGGER.workout);
  const justDoneIds = new Set((missions?.completedNow ?? []).map((m) => m.id));
  const list: FinishMission[] = (missions?.views ?? [])
    .filter((v) => workoutKinds.has(v.kind) || justDoneIds.has(v.id))
    .map((v) => ({
      kind: v.kind,
      ...(v.params.exerciseName ? { exerciseName: v.params.exerciseName } : {}),
      value: v.progress.value,
      goal: v.progress.goal,
      done: v.completedAt != null || v.progress.done,
      justDone: justDoneIds.has(v.id),
    }));
  const streak = await loadTrainingStreakStatus(supabase, input.clientId, input.today);
  return {
    durationMin: durationMinutes(input.startedAtMs, Date.now()),
    ...nums,
    prs: report.prs,
    xp: xpGained({
      prs: report.prs,
      badgeIds: report.badgeIds,
      missionXp: (missions?.completedNow ?? []).reduce((a, m) => a + m.xp, 0),
      bonus: missions?.bonusNow === true,
    }),
    missions: list,
    bonus: missions?.bonusNow === true,
    streakWeeks: streak.weeks,
    needThisWeek: streak.needThisWeek,
    freezeUsed: streak.freezeUsed,
    levelUp: report.levelUp?.to ?? null,
    weekStart: weekStartOf(input.today),
  };
}

export async function setFinishSummaryCookie(summary: FinishSummary): Promise<void> {
  try {
    (await cookies()).set(FINISH_COOKIE, encodeFinishSummary(summary), {
      path: "/portal",
      maxAge: FINISH_COOKIE_MAX_AGE_S,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  } catch {
    /* súhrn je dekorácia — chyba cookie nikdy nezhodí ukončenie tréningu */
  }
}

export async function readFinishSummary(): Promise<FinishSummary | null> {
  return parseFinishSummary((await cookies()).get(FINISH_COOKIE)?.value);
}
