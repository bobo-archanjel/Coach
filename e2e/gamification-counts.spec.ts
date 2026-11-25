// i18n-ignore-file: čisté testy bez siete a DB — každý dokončený tréning sa rátá (vymyslené dáta)
import { test, expect } from "@playwright/test";
import { BADGES, EMPTY_BADGE_STATS, satisfiedBadges } from "../lib/gamification/badges";
import { buildGamificationHome, computeBadgeStats } from "../lib/gamification/stats";
import { computeXp } from "../lib/gamification/xp";
import { buildMissionContext, missionProgress } from "../lib/gamification/missions";
import { buildWeeklySummary } from "../lib/gamification/weekly";

const MONDAY = "2026-11-23";
const log = (id: string, performedOn: string, workoutDayId: string | null) => ({ id, performedOn, workoutDayId, entries: [] });

test.describe("každý tréning sa rátá", () => {
  test("3 tréningy v jeden deň = workoutCount 3 a odznaky za počet", () => {
    const logs = [log("a", MONDAY, "d1"), log("b", MONDAY, "d2"), log("c", MONDAY, null)];
    const s = computeBadgeStats({ logs, prCount: 0, foodDaily: [], proteinTarget: null, bodyMetricCount: 0, plans: [], weeklyTarget: 3, today: MONDAY });
    expect(s.workoutCount).toBe(3);
    const ids = satisfiedBadges(s).map((b) => (typeof b === "string" ? b : b.id));
    expect(ids).toContain("first_workout");
    expect(BADGES.length).toBeGreaterThan(0);
    expect(EMPTY_BADGE_STATS.workoutCount).toBe(0);
  });

  test("vlastný plán (workoutDayId null / iný) sa rátá rovnako ako trénerov", () => {
    const base = { prCount: 0, foodDaily: [], proteinTarget: null, bodyMetricCount: 0, plans: [], weeklyTarget: 3, today: MONDAY };
    const trainer = computeBadgeStats({ ...base, logs: [log("a", MONDAY, "d1")] });
    const own = computeBadgeStats({ ...base, logs: [log("a", MONDAY, null)] });
    expect(own.workoutCount).toBe(trainer.workoutCount);
  });

  test("XP rastie s každým tréningom", () => {
    const a = computeXp({ workouts: 1, foodDays: 0, prs: 0, badgeIds: [] });
    const b = computeXp({ workouts: 3, foodDays: 0, prs: 0, badgeIds: [] });
    expect(b.workouts).toBe(a.workouts * 3);
  });

  test("misia „workouts“ a kontext misií rátajú tréningy, nie dni", () => {
    const logs = [{ performedOn: MONDAY, entries: [] }, { performedOn: MONDAY, entries: [] }, { performedOn: "2026-11-24", entries: [] }];
    const p = missionProgress({ kind: "workouts", target: 5, params: {} }, { weekStart: MONDAY, logs, foodDates: [], proteinMetDates: [], prEvents: [], bodyMetricDates: [] });
    expect(p.value).toBe(3);
    const ctx = buildMissionContext({ today: "2026-11-25", planTarget: 3, logs, foodDaily: [], proteinTarget: null, lastMeasurementOn: null, proteinMet: () => false });
    expect(ctx.doneThisWeek.workoutDays).toBe(3);
    const prev = buildMissionContext({ today: "2026-11-30", planTarget: 3, logs, foodDaily: [], proteinTarget: null, lastMeasurementOn: null, proteinMet: () => false });
    expect(prev.last4.workouts[0]).toBe(3);
  });

  test("týždenný súhrn a riadok „Tento týždeň“ rátajú tréningy", () => {
    const w = buildWeeklySummary({
      weekStart: MONDAY,
      logsWeek: [{ performedOn: MONDAY, entries: [] }, { performedOn: MONDAY, entries: [] }],
      logsPrev: [],
      foodDates: [],
      proteinDays: 0,
      proteinTarget: null,
      workoutTarget: 2,
      prs: [],
      badgeIds: [],
      challengeNames: [],
      streakWeeks: 0,
    });
    expect(w.workouts).toEqual({ done: 2, target: 2, met: true });
    const home = buildGamificationHome(
      { workouts: 2, foodDays: 0, prCount: 0, badgeIds: [] },
      { planDays: 3, trainedDates: [MONDAY, MONDAY, "2026-11-24"], today: "2026-11-25", daily: null },
    );
    expect(home.week.done).toBe(3);
  });
});
