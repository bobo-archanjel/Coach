// i18n-ignore-file: testy gamifikácie v2 — čisté testy bez siete a bez DB (vymyslené mená a texty)
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  BADGES,
  EMPTY_BADGE_STATS,
  LEGACY_BADGE_MAP,
  LEGACY_BADGE_RARITY,
  TIER_ORDER,
  badgeById,
  buildBadgeViews,
  canonicalBadgeId,
  countMondayWeeks,
  countTimeOfDay,
  countWeekendDoubles,
  displayAmount,
  easterSunday,
  hasChristmasWorkout,
  hasComeback,
  hasEasterWeekWorkout,
  isEasterWeek,
  localHour,
  missingBadges,
  nextBadges,
  normalizeBadgeIds,
  normalizeEarnedOn,
  satisfiedBadges,
  type BadgeStats,
} from "../lib/gamification/badges";
import { computeBadgeStats, countDistinctExercises } from "../lib/gamification/stats";
import {
  LEVEL_FROM,
  LEVELS,
  MAX_LEVEL,
  XP_BADGE,
  XP_MISSION_BONUS,
  computeXp,
  groupOfLevel,
  levelDetail,
  levelFor,
} from "../lib/gamification/xp";
import {
  FRAME_IDS,
  FRAME_LEVEL,
  FREEZE_LEVELS,
  MAX_STORED_FREEZES,
  THEME_IDS,
  THEME_LEVEL,
  effectiveFrame,
  effectiveTheme,
  freezeSourcesForLevel,
  frameUnlocked,
  isFrameId,
  nextReward,
  rewardsAt,
  rewardsBetween,
  themeUnlocked,
  unlockedFrames,
  unlockedThemes,
} from "../lib/gamification/rewards";
import {
  MEASUREMENT_STALE_DAYS,
  MISSIONS_PER_WEEK,
  MISSION_XP,
  allMissionsDone,
  buildMissionContext,
  daysLeftInWeek,
  evaluateMissions,
  fairFoodTarget,
  fairVolumeTarget,
  fairWorkoutTarget,
  generateMissions,
  hashSeed,
  missionProgress,
  missionXpTotal,
  newlyCompleted,
  seededRandom,
  type MissionContext,
  type MissionData,
  type MissionRow,
} from "../lib/gamification/missions";
import {
  buildExerciseHistories,
  isNewPersonalRecord,
  progressionHint,
  targetRepsOf,
  weightStep,
} from "../lib/gamification/progression";
import { detectPersonalRecords } from "../lib/gamification/records";
import { proteinMet } from "../lib/gamification/rings";
import {
  FREEZE_MAX_AGE_WEEKS,
  computeFoodStreak,
  computeTrainingStreak,
  planFoodFreezes,
  planFreezes,
  planTrainingFreezes,
  runLength,
} from "../lib/portal/streak";
import { cachedStreakValid, streakSnapshot } from "../lib/gamification/streakCache";
import {
  NICKNAME_MAX,
  NICKNAME_MIN,
  defaultNickname,
  displayNickname,
  isBlockedNickname,
  validateNickname,
} from "../lib/gamification/nickname";
import { GLOBAL_TOP_N, rankGlobal, toPublicBoard, type GlobalClient } from "../lib/gamification/leaderboardGlobal";
import { maskName } from "../lib/gamification/leaderboard";
import {
  FINISH_COOKIE,
  durationMinutes,
  encodeFinishSummary,
  parseFinishSummary,
  workoutNumbers,
  xpGained,
  type FinishSummary,
} from "../lib/gamification/finishSummary";
import { allowedLeaderboardMetrics } from "../lib/gamification/limits";
import { ALL_LEADERBOARD_METRICS } from "../lib/billing/plans";
import skMessages from "../messages/sk/gamification.json";
import csMessages from "../messages/cs/gamification.json";

/**
 * Gamifikácia klienta v2 (fáza 1): týždenné misie, živá motivácia pri sérii, stupne odznakov a nové odznaky,
 * úrovne s odmenami, zmrazenia série, celoappkový rebríček s prezývkou. Čisté funkcie — bez DB a bez prehliadača.
 */

const TODAY = "2026-11-25"; // streda
const MONDAY = "2026-11-23";
const sets = (name: string, ...s: [number, number][]) => [{ name, sets: s.map(([weight, reps]) => ({ weight, reps })) }];
const stats = (patch: Partial<BadgeStats>): BadgeStats => ({ ...EMPTY_BADGE_STATS, ...patch });
const addDays = (iso: string, n: number) => new Date(new Date(`${iso}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

// ================================================================ týždenné misie
test.describe("týždenné misie", () => {
  /** 4 predošlé týždne po 3 tréningy s drepom/lavicou, jedlo 5 dní týždenne, bielkoviny 3 dni. */
  function history(opts: { workoutsPerWeek?: number; foodPerWeek?: number } = {}) {
    const wk = opts.workoutsPerWeek ?? 3;
    const logs: { performedOn: string; entries: unknown }[] = [];
    const foodDaily: { date: string; protein: number }[] = [];
    for (let w = 1; w <= 4; w++) {
      const start = addDays(MONDAY, -7 * w);
      for (let d = 0; d < wk; d++) {
        logs.push({ performedOn: addDays(start, d), entries: [...sets("Drep", [100, 5], [100, 5]), ...sets("Bench", [60, 8])] });
      }
      for (let d = 0; d < (opts.foodPerWeek ?? 5); d++) foodDaily.push({ date: addDays(start, d), protein: d < 3 ? 150 : 40 });
    }
    return { logs, foodDaily };
  }
  const ctxFor = (over: Partial<Parameters<typeof buildMissionContext>[0]> = {}, today = TODAY): MissionContext =>
    buildMissionContext({
      today,
      planTarget: 3,
      ...history(),
      proteinTarget: 150,
      lastMeasurementOn: addDays(today, -3),
      proteinMet,
      ...over,
    });

  test("seed je deterministický: rovnaký klient + týždeň = rovnaké misie, bez cronu a bez náhody", () => {
    const ctx = ctxFor();
    const a = generateMissions("client-1", ctx);
    const b = generateMissions("client-1", ctx);
    expect(b).toEqual(a);
    expect(hashSeed("x|2026-11-23")).toBe(hashSeed("x|2026-11-23"));
    const r1 = seededRandom(42);
    const r2 = seededRandom(42);
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
  });

  test("každý týždeň presne 3 rôzne misie, slot 1 je vždy „Odcvič N tréningov“", () => {
    for (const client of ["a", "b", "c", "d", "e", "f"]) {
      for (let w = 0; w < 6; w++) {
        const ctx = ctxFor({}, addDays(TODAY, 7 * w));
        const m = generateMissions(client, ctx);
        expect(m).toHaveLength(MISSIONS_PER_WEEK);
        expect(m[0].kind).toBe("workouts");
        expect(new Set(m.map((x) => x.kind)).size).toBe(MISSIONS_PER_WEEK);
        for (const x of m) expect(x.xp).toBe(MISSION_XP[x.kind]);
      }
    }
  });

  test("výber sa líši medzi klientmi a týždňami (variety)", () => {
    const sig = (client: string, today: string) =>
      generateMissions(client, ctxFor({}, today))
        .map((m) => m.kind)
        .join(",");
    const seen = new Set<string>();
    for (const client of ["a", "b", "c", "d", "e", "f", "g", "h"]) for (let w = 0; w < 4; w++) seen.add(sig(client, addDays(TODAY, 7 * w)));
    expect(seen.size).toBeGreaterThan(3);
  });

  test("spravodlivosť: cieľ tréningov = tempo + 1, nikdy nad plán; bez histórie 2", () => {
    // tempo 1 tréning týždenne, plán 3 → 2
    const slow = ctxFor({ ...history({ workoutsPerWeek: 1 }), planTarget: 3 }, MONDAY);
    expect(fairWorkoutTarget(slow)).toBe(2);
    // tempo 3, plán 3 → strop plánom (3), nie 4
    expect(fairWorkoutTarget(ctxFor({ planTarget: 3 }, MONDAY))).toBe(3);
    // plán 2 a tempo 3 → 2
    expect(fairWorkoutTarget(ctxFor({ planTarget: 2 }, MONDAY))).toBe(2);
    // nový klient bez histórie → najviac 2
    const fresh = ctxFor({ logs: [], foodDaily: [], planTarget: 4 }, MONDAY);
    expect(fairWorkoutTarget(fresh)).toBe(2);
    // plán 7 dní sa pre misiu zreže na 5
    expect(fairWorkoutTarget(ctxFor({ ...history({ workoutsPerWeek: 6 }), planTarget: 7 }, MONDAY))).toBeLessThanOrEqual(5);
  });

  test("uprostred týždňa sa cieľ nestanovuje nad to, čo sa stihne (štvrtok: 4 dni vrátane dneška)", () => {
    const thu = ctxFor({ planTarget: 5, ...history({ workoutsPerWeek: 5 }) }, addDays(MONDAY, 3));
    expect(daysLeftInWeek(MONDAY, addDays(MONDAY, 3))).toBe(4);
    expect(fairWorkoutTarget(thu)).toBe(4);
    // v nedeľu s 0 hotovými tréningami je cieľ najviac 1
    const sun = ctxFor({ planTarget: 4, ...history({ workoutsPerWeek: 4 }) }, addDays(MONDAY, 6));
    expect(fairWorkoutTarget(sun)).toBe(1);
  });

  test("jedlo: cieľ 3–6 dní podľa tempa; bielkoviny len pri nastavenom cieli", () => {
    const ctx = ctxFor({}, MONDAY);
    expect(fairFoodTarget(ctx)).toBe(6); // tempo 5 → 6
    expect(fairFoodTarget(ctxFor({ ...history({ foodPerWeek: 1 }) }, MONDAY))).toBe(3);
    const noProtein = new Set<string>();
    const withProtein = new Set<string>();
    for (const c of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]) {
      generateMissions(c, ctxFor({ proteinTarget: null }, MONDAY)).forEach((m) => noProtein.add(m.kind));
      generateMissions(c, ctxFor({ proteinTarget: 150 }, MONDAY)).forEach((m) => withProtein.add(m.kind));
    }
    expect(noProtein.has("protein_days")).toBe(false);
    expect(withProtein.has("protein_days")).toBe(true);
  });

  test("rekord: len pre často cvičený cvik s váhou, cvik je v params; meranie len keď 4+ týždne nič", () => {
    const ctx = ctxFor({}, MONDAY);
    expect(ctx.topExercises.map((e) => e.key)).toEqual(expect.arrayContaining(["drep", "bench"]));
    const prKinds: { exerciseKey?: string }[] = [];
    for (let i = 0; i < 40; i++) generateMissions(`k${i}`, ctx).filter((m) => m.kind === "pr_exercise").forEach((m) => prKinds.push(m.params));
    expect(prKinds.length).toBeGreaterThan(0);
    for (const p of prKinds) expect(["drep", "bench"]).toContain(p.exerciseKey);
    // cvik s 2 zápismi (menej než 3) sa nenavrhne
    const rare = buildMissionContext({ today: MONDAY, planTarget: 3, logs: history().logs.slice(0, 2), foodDaily: [], proteinTarget: null, lastMeasurementOn: null, proteinMet });
    expect(rare.topExercises).toEqual([]);
    for (let i = 0; i < 30; i++) expect(generateMissions(`r${i}`, rare).some((m) => m.kind === "pr_exercise")).toBe(false);

    // meranie: čerstvé = nikdy; staré / žiadne = ponúka sa
    const fresh = ctxFor({ lastMeasurementOn: addDays(MONDAY, -(MEASUREMENT_STALE_DAYS - 1)) }, MONDAY);
    for (let i = 0; i < 30; i++) expect(generateMissions(`m${i}`, fresh).some((m) => m.kind === "measurement")).toBe(false);
    const stale = ctxFor({ lastMeasurementOn: null }, MONDAY);
    expect(Array.from({ length: 30 }, (_, i) => generateMissions(`m${i}`, stale).some((m) => m.kind === "measurement")).some(Boolean)).toBe(true);
  });

  test("objem = typický týždenný objem × 1,1 zaokrúhlený na 50 kg; „do stredy“ len v pondelok–stredu", () => {
    // 4 týždne × 3 tréningy × (100×5×2 + 60×8) = 4 týždne × 3 × 1480 = 4440 kg/týždeň → ×1,1 = 4884 → 4900
    expect(fairVolumeTarget(ctxFor({}, MONDAY))).toBe(4900);
    expect(fairVolumeTarget(ctxFor({ logs: [], foodDaily: [] }, MONDAY))).toBeNull();
    const thursday = addDays(MONDAY, 3);
    for (let i = 0; i < 40; i++) {
      expect(generateMissions(`w${i}`, ctxFor({}, thursday)).some((m) => m.kind === "workout_by_wed")).toBe(false);
      // objem sa vo štvrtok už neponúka (menej než 4 dni do konca týždňa je málo)
      expect(generateMissions(`w${i}`, ctxFor({}, addDays(MONDAY, 4))).some((m) => m.kind === "volume")).toBe(false);
    }
    const monday = Array.from({ length: 60 }, (_, i) => generateMissions(`w${i}`, ctxFor({}, MONDAY)).some((m) => m.kind === "workout_by_wed"));
    expect(monday.some(Boolean)).toBe(true);
  });

  test("progres sa počíta zo skutočných dát (tréningy, jedlo, rekord, objem, meranie, séria)", () => {
    const row = (kind: MissionRow["kind"], target: number, params: MissionRow["params"] = {}, i = 1): MissionRow => ({ id: `m${i}`, slot: i, kind, target, xp: MISSION_XP[kind], params, completedAt: null });
    const data: MissionData = {
      weekStart: MONDAY,
      logs: [
        { performedOn: "2026-11-22", entries: sets("Drep", [100, 5]) }, // minulý týždeň — nepočíta sa
        { performedOn: "2026-11-23", entries: sets("Drep", [100, 5], [100, 5]) },
        { performedOn: "2026-11-23", entries: sets("Bench", [60, 10]) }, // druhý tréning v ten istý deň = jeden deň
        { performedOn: "2026-11-25", entries: sets("Drep", [100, 5]) },
      ],
      foodDates: ["2026-11-22", "2026-11-23", "2026-11-24"],
      proteinMetDates: ["2026-11-24"],
      prEvents: [{ exerciseKey: "drep", achievedOn: "2026-11-24" }],
      bodyMetricDates: ["2026-11-20"],
    };
    expect(missionProgress(row("workouts", 3), data)).toEqual({ value: 2, goal: 3, done: false });
    expect(missionProgress(row("workouts", 2), data).done).toBe(true);
    expect(missionProgress(row("food_days", 3), data)).toEqual({ value: 2, goal: 3, done: false }); // 22. 11. je minulý týždeň
    expect(missionProgress(row("protein_days", 1), data).done).toBe(true);
    expect(missionProgress(row("pr_exercise", 1, { exerciseKey: "drep" }), data).done).toBe(true);
    expect(missionProgress(row("pr_exercise", 1, { exerciseKey: "bench" }), data).done).toBe(false);
    expect(missionProgress(row("workout_by_wed", 1), data).done).toBe(true); // 23. 11. je pondelok
    expect(missionProgress(row("volume", 2000), data)).toEqual({ value: 2000, goal: 2000, done: true });
    expect(missionProgress(row("volume", 3000), data)).toMatchObject({ value: 2100, done: false });
    expect(missionProgress(row("measurement", 1), data).done).toBe(false); // meranie z 20. 11. je minulý týždeň
    expect(missionProgress(row("sets", 4), data).done).toBe(true);
    // „do stredy“ nesplní tréning vo štvrtok
    const late: MissionData = { ...data, logs: [{ performedOn: "2026-11-26", entries: sets("Drep", [100, 5]) }] };
    expect(missionProgress(row("workout_by_wed", 1), late).done).toBe(false);
  });

  test("splnenie je idempotentné: uložené splnenie sa nevracia, nové sa nájde len raz; 3 splnené = bonus", () => {
    const rows: MissionRow[] = [
      { id: "1", slot: 1, kind: "workouts", target: 1, xp: 40, params: {}, completedAt: "2026-11-24T10:00:00Z" },
      { id: "2", slot: 2, kind: "food_days", target: 2, xp: 30, params: {}, completedAt: null },
      { id: "3", slot: 3, kind: "measurement", target: 1, xp: 20, params: {}, completedAt: null },
    ];
    const none: MissionData = { weekStart: MONDAY, logs: [], foodDates: [], proteinMetDates: [], prEvents: [], bodyMetricDates: [] };
    // aj bez dát ostáva uložené splnenie splnené
    const v0 = evaluateMissions(rows, none);
    expect(v0[0].progress.done).toBe(true);
    expect(newlyCompleted(v0)).toEqual([]);
    expect(allMissionsDone(v0)).toBe(false);
    const withFood = evaluateMissions(rows, { ...none, foodDates: ["2026-11-23", "2026-11-24"], bodyMetricDates: ["2026-11-25"] });
    expect(newlyCompleted(withFood).map((v) => v.id)).toEqual(["2", "3"]);
    expect(allMissionsDone(withFood)).toBe(true);
    // XP: splnené misie + bonus týždňa
    expect(missionXpTotal(rows, 0)).toBe(40);
    expect(missionXpTotal(rows.map((r) => ({ ...r, completedAt: "x" })), 1)).toBe(40 + 30 + 20 + XP_MISSION_BONUS);
  });

  test("XP z misií sa započíta do XP (a nemení ostatné zložky)", () => {
    const base = computeXp({ workouts: 2, foodDays: 3, prs: 1, badgeIds: [] });
    const withM = computeXp({ workouts: 2, foodDays: 3, prs: 1, badgeIds: [], missionXp: 140 });
    expect(withM.total - base.total).toBe(140);
    expect(withM.missions).toBe(140);
    expect(base.missions).toBe(0);
  });

  test("misie: žiadna misia nie je za chudnutie ani kalórie", () => {
    const src = readFileSync("lib/gamification/missions.ts", "utf8");
    expect(src).not.toMatch(/kind:\s*"(weight_loss|kcal|calories|lose)/i);
    expect(/MISSION_KINDS = \[[^\]]*(kcal|calor|lose|weightloss)/i.test(src)).toBe(false);
  });
});

// ================================================================ živá motivácia pri sérii
test.describe("nápoveda z histórie a kontrola rekordu", () => {
  test("všetky série na cieľové opakovania → +2,5 kg", () => {
    const h = progressionHint([{ weight: 80, reps: 8 }, { weight: 80, reps: 8 }, { weight: 80, reps: 8 }], { plannedReps: "8" });
    expect(h).toEqual({ kind: "weight", lastWeight: 80, lastReps: 8, nextWeight: 82.5, nextReps: 8 });
  });

  test("rozsah opakovaní „8-10“: cieľ je horná hranica", () => {
    expect(targetRepsOf("8-10")).toBe(10);
    expect(targetRepsOf("8")).toBe(8);
    expect(targetRepsOf("max")).toBeNull();
    expect(targetRepsOf(null)).toBeNull();
    const miss = progressionHint([{ weight: 80, reps: 10 }, { weight: 80, reps: 8 }], { plannedReps: "8-10" });
    expect(miss).toMatchObject({ kind: "reps", nextWeight: 80, nextReps: 10 });
    const hit = progressionHint([{ weight: 80, reps: 10 }, { weight: 80, reps: 10 }], { plannedReps: "8-10" });
    expect(hit).toMatchObject({ kind: "weight", nextWeight: 82.5 });
  });

  test("nesplnené opakovania → rovnaká váha a o opakovanie viac", () => {
    const h = progressionHint([{ weight: 80, reps: 8 }, { weight: 80, reps: 6 }], { plannedReps: "8" });
    expect(h).toEqual({ kind: "reps", lastWeight: 80, lastReps: 8, nextWeight: 80, nextReps: 8 });
    const h2 = progressionHint([{ weight: 80, reps: 6 }, { weight: 80, reps: 5 }], { plannedReps: "8" });
    expect(h2).toMatchObject({ kind: "reps", nextReps: 7 });
  });

  test("rozcvička (ľahká séria) nepokazí „všetky opakovania splnené“", () => {
    const h = progressionHint([{ weight: 40, reps: 3 }, { weight: 80, reps: 8 }, { weight: 80, reps: 8 }], { plannedReps: "8" });
    expect(h).toMatchObject({ kind: "weight", nextWeight: 82.5 });
  });

  test("bezpečnosť: skok nikdy nad 5 % (a nad 2,5 kg) — ľahká váha rastie po menších krokoch", () => {
    expect(weightStep(80)).toBe(2.5);
    expect(weightStep(200)).toBe(2.5);
    expect(weightStep(20)).toBe(1);
    expect(weightStep(10)).toBe(0.5);
    expect(weightStep(5)).toBe(0.5);
    for (const w of [2, 5, 10, 20, 30, 45, 60, 100, 140, 300]) {
      const h = progressionHint([{ weight: w, reps: 10 }, { weight: w, reps: 10 }], { plannedReps: "10" });
      expect(h?.kind).toBe("weight");
      if (h?.kind === "weight") {
        const jump = h.nextWeight - w;
        expect(jump).toBeGreaterThan(0);
        expect(jump).toBeLessThanOrEqual(2.5);
        // 5 % limit (s toleranciou na minimálny krok 0,5 kg pri veľmi ľahkých váhach)
        expect(jump).toBeLessThanOrEqual(Math.max(0.5, w * 0.05) + 1e-9);
      }
    }
  });

  test("vlastná váha: o opakovanie viac; na čas: o 5 s viac; bez dát nič", () => {
    expect(progressionHint([{ weight: null, reps: 12 }, { weight: null, reps: 10 }])).toEqual({ kind: "bodyweight", lastReps: 12, nextReps: 13 });
    expect(progressionHint([{ weight: null, reps: null, durationS: 40 }, { weight: null, reps: null, durationS: 45 }], { timed: true })).toEqual({
      kind: "time",
      lastSeconds: 45,
      nextSeconds: 50,
    });
    expect(progressionHint([])).toBeNull();
    expect(progressionHint([{ weight: null, reps: null }])).toBeNull();
  });

  test("história z jedného dopytu: posledný zápis, najlepšie hodnoty a uložené rekordy", () => {
    const logs = [
      { performedOn: "2026-10-01", entries: sets("Drep", [100, 5]) },
      { performedOn: "2026-11-10", entries: sets("Drep", [105, 5], [105, 5]) },
      { performedOn: "2026-11-20", entries: [...sets("Drep", [100, 8]), ...sets("Bench", [60, 8])] },
    ];
    const h = buildExerciseHistories(logs, new Set(["drep"]), new Map([["drep", { weight: 110, e1rm: 120 }]]));
    expect(Object.keys(h)).toEqual(["drep"]); // Bench sa nevyžiadal
    expect(h.drep.lastOn).toBe("2026-11-20");
    expect(h.drep.lastSets).toEqual([{ weight: 100, reps: 8 }]);
    expect(h.drep.sessions).toBe(3);
    expect(h.drep.bestWeight).toBe(110); // z uloženého rekordu staršieho než okno
    expect(h.drep.bestE1rm).toBeCloseTo(126.7, 1); // 100 × 8 z posledného zápisu je lepšie než uložených 120
  });

  test("inline rekord: vyššia váha ALEBO vyšší odhad 1RM, remíza nie, prvý zápis nie", () => {
    const hist = { bestWeight: 100, bestE1rm: 116.7, sessions: 3 };
    expect(isNewPersonalRecord(hist, 102.5, 3)).toBe(true); // vyššia váha
    expect(isNewPersonalRecord(hist, 100, 5)).toBe(false); // remíza váhy a 1RM (100 × 5 ≈ 116,7)
    expect(isNewPersonalRecord(hist, 100, 8)).toBe(true); // rovnaká váha, vyšší e1RM
    expect(isNewPersonalRecord(hist, 90, 5)).toBe(false);
    expect(isNewPersonalRecord(hist, 0, 5)).toBe(false);
    expect(isNewPersonalRecord(hist, 105, 0)).toBe(false);
    expect(isNewPersonalRecord(undefined, 200, 5)).toBe(false); // žiadna história
    expect(isNewPersonalRecord({ ...hist, sessions: 0 }, 200, 5)).toBe(false); // prvý zápis cviku nie je rekord
  });

  test("klientska kontrola sa zhoduje so serverom (records.ts) na rovnakej histórii", () => {
    const history = [
      { id: "a", performedOn: "2026-10-01", entries: sets("Drep", [100, 5]) },
      { id: "b", performedOn: "2026-10-08", entries: sets("Drep", [100, 8]) },
    ];
    const hists = buildExerciseHistories(history, new Set(["drep"]));
    for (const [w, r] of [[102.5, 3], [100, 5], [100, 9], [95, 8], [100, 8], [110, 1]] as [number, number][]) {
      const server = detectPersonalRecords([...history, { id: "c", performedOn: "2026-10-15", entries: sets("Drep", [w, r]) }]).some((e) => e.sourceLogId === "c");
      expect(isNewPersonalRecord(hists.drep, w, r), `${w} × ${r}`).toBe(server);
    }
  });
});

// ================================================================ odznaky: stupne, mapovanie, nové pravidlá
test.describe("odznaky v2", () => {
  test("rodiny majú bronz / striebro / zlato s rastúcimi hranicami a vzácnosťou", () => {
    for (const family of ["workouts", "streak", "volume", "prs", "food"]) {
      const defs = TIER_ORDER.map((t) => badgeById(`${family}_${t}`)!);
      expect(defs.every(Boolean), family).toBe(true);
      expect(defs.map((d) => d.rarity)).toEqual(["common", "rare", "epic"]);
      const goals = defs.map((d) => d.progress!(EMPTY_BADGE_STATS).goal);
      expect([...goals].sort((a, b) => a - b)).toEqual(goals);
    }
    expect(badgeById("workouts_gold")!.progress!(EMPTY_BADGE_STATS).goal).toBe(150);
    expect(badgeById("volume_gold")!.progress!(EMPTY_BADGE_STATS).goal).toBe(200_000);
    expect(badgeById("prs_silver")!.progress!(EMPTY_BADGE_STATS).goal).toBe(25);
    expect(badgeById("food_gold")!.progress!(EMPTY_BADGE_STATS).goal).toBe(100);
  });

  test("migrácia starých ID: každé staré ID mapuje na existujúci stupeň, nič sa neduplikuje", () => {
    for (const [legacy, target] of Object.entries(LEGACY_BADGE_MAP)) {
      expect(badgeById(target), legacy).toBeTruthy();
      expect(badgeById(legacy), `${legacy} už nie je v katalógu`).toBeUndefined();
      expect(LEGACY_BADGE_RARITY[legacy], legacy).toBeTruthy();
    }
    expect(canonicalBadgeId("workouts_25")).toBe("workouts_bronze");
    expect(canonicalBadgeId("workouts_100")).toBe("workouts_silver");
    expect(canonicalBadgeId("streak_52w")).toBe("streak_gold");
    expect(canonicalBadgeId("first_workout")).toBe("first_workout");
    // staré ID kopcujúce do jedného stupňa sa zlúčia
    expect([...normalizeBadgeIds(["workouts_10", "workouts_25", "first_workout"])].sort()).toEqual(["first_workout", "workouts_bronze"]);
    // dátum zlúčeného odznaku = najskorší
    expect(normalizeEarnedOn([["workouts_25", "2026-05-01"], ["workouts_10", "2026-03-01"]]).get("workouts_bronze")).toBe("2026-03-01");
  });

  test("držiteľ starého odznaku nedostane stupeň znova (žiadna duplicitná oslava), ďalší stupeň áno", () => {
    const owned = new Set(["first_workout", "workouts_10", "workouts_25", "workouts_50"]);
    const s = stats({ workoutCount: 60 });
    expect(missingBadges(s, owned)).toEqual([]); // 10/25 → bronz, 50 → striebro
    expect(missingBadges(stats({ workoutCount: 150 }), owned)).toEqual(["workouts_gold"]);
    // galéria ukáže získané stupne z historických ID a skrytý odznak ostáva skrytý
    const views = buildBadgeViews(new Map([["workouts_25", "2026-03-01"], ["workouts_50", "2026-04-01"]]));
    expect(views.find((v) => v.id === "workouts_bronze")).toMatchObject({ earned: true, earnedOn: "2026-03-01", tier: "bronze" });
    expect(views.find((v) => v.id === "workouts_silver")).toMatchObject({ earned: true, earnedOn: "2026-04-01" });
    expect(views.find((v) => v.id === "workouts_gold")).toMatchObject({ earned: false });
    expect(views.find((v) => v.id === "easter_week")).toMatchObject({ earned: false, revealed: false });
  });

  test("XP za už získané staré odznaky sa migráciou nezmení", () => {
    const legacy = computeXp({ workouts: 0, foodDays: 0, prs: 0, badgeIds: ["first_workout", "workouts_10", "workouts_25", "workouts_50", "workouts_100", "workouts_250"] });
    expect(legacy.badges).toBe(XP_BADGE.common * 3 + XP_BADGE.rare * 2 + XP_BADGE.epic);
    // nové stupne dávajú XP podľa vzácnosti
    expect(computeXp({ workouts: 0, foodDays: 0, prs: 0, badgeIds: ["workouts_bronze", "workouts_silver", "workouts_gold"] }).badges).toBe(XP_BADGE.common + XP_BADGE.rare + XP_BADGE.epic);
    expect(computeXp({ workouts: 0, foodDays: 0, prs: 0, badgeIds: ["neznamy_odznak"] }).badges).toBe(0);
  });

  test("Nočná sova a Ranné vtáča: čas DOKONČENIA v miestnom čase (zima aj leto)", () => {
    expect(localHour("2026-11-24T20:30:00Z")).toBe(21); // zima: UTC+1
    expect(localHour("2026-07-24T19:30:00Z")).toBe(21); // leto: UTC+2
    expect(localHour("2026-11-24T06:59:00Z")).toBe(7);
    expect(localHour(null)).toBeNull();
    expect(localHour("nie-je-dátum")).toBeNull();
    const times = [
      "2026-11-02T20:00:00Z", // 21:00 → noc
      "2026-11-03T21:30:00Z", // 22:30
      "2026-11-04T23:30:00Z", // 0:30 — po polnoci ešte patrí do noci (do 4:00)
      "2026-11-05T06:30:00Z", // 7:30
      "2026-11-06T19:59:00Z", // 20:59 → nič
      "2026-11-07T07:00:00Z", // 8:00 → nič
      null,
    ];
    expect(countTimeOfDay(times)).toEqual({ night: 3, early: 1 });
    expect(countTimeOfDay(["2026-11-05T03:30:00Z"])).toEqual({ night: 0, early: 1 }); // 4:30
    const night = Array.from({ length: 5 }, () => "2026-11-10T21:00:00Z");
    expect(satisfiedBadges(stats(computeBadgeStats(logsInput(night.map((c, i) => ({ id: `n${i}`, performedOn: `2026-11-1${i}`, completedAt: c }))))))).toContain("night_owl");
    expect(satisfiedBadges(stats({ nightWorkouts: 4 }))).not.toContain("night_owl");
    expect(satisfiedBadges(stats({ earlyWorkouts: 5 }))).toContain("early_bird");
  });

  test("Víkendový bojovník: sobota AJ nedeľa v rovnakom víkende, 4 víkendy", () => {
    // 2026-11-07 (so) + 11-08 (ne), 11-14 + 11-15, 11-21 + 11-22, 11-28 + 11-29
    const dates = ["2026-11-07", "2026-11-08", "2026-11-14", "2026-11-15", "2026-11-21", "2026-11-22", "2026-11-28"];
    expect(countWeekendDoubles(dates)).toBe(3);
    expect(satisfiedBadges(stats({ weekendDoubles: countWeekendDoubles(dates) }))).not.toContain("weekend_warrior");
    expect(countWeekendDoubles([...dates, "2026-11-29"])).toBe(4);
    expect(satisfiedBadges(stats({ weekendDoubles: 4 }))).toContain("weekend_warrior");
    // nedeľa bez soboty (a sobota bez nedele) sa nepočíta
    expect(countWeekendDoubles(["2026-11-08", "2026-11-14", "2026-11-22"])).toBe(0);
  });

  test("Comeback: tréning po pauze 14+ dní, kratšia pauza nie", () => {
    expect(hasComeback(["2026-10-01", "2026-10-15"])).toBe(false); // 13 dní bez tréningu
    expect(hasComeback(["2026-10-01", "2026-10-16"])).toBe(true); // 14 dní bez tréningu
    expect(hasComeback(["2026-10-01"])).toBe(false);
    expect(hasComeback([])).toBe(false);
    expect(satisfiedBadges(stats({ comeback: true }))).toContain("comeback");
  });

  test("Tank (objem jedného tréningu), Všestranný (15 cvikov), Pondelková sila (8 týždňov)", () => {
    const big = sets("Drep", [100, 10], [100, 10], [100, 10], [100, 10], [100, 10]); // 5000 kg
    const s = computeBadgeStats(logsInput([{ id: "a", performedOn: "2026-11-02", entries: big }, { id: "b", performedOn: "2026-11-03", entries: sets("Bench", [60, 5]) }]));
    expect(s.maxWorkoutVolumeKg).toBe(5000);
    expect(satisfiedBadges(s)).toContain("tank");
    expect(satisfiedBadges(stats({ maxWorkoutVolumeKg: 4999 }))).not.toContain("tank");

    const many = Array.from({ length: 15 }, (_, i) => ({ name: `Cvik ${i}`, sets: [{ weight: 10, reps: 5 }] }));
    expect(countDistinctExercises([{ entries: many.slice(0, 14) }])).toBe(14);
    expect(countDistinctExercises([{ entries: many }, { entries: sets("cvik 3", [5, 5]) }])).toBe(15); // názov sa zjednocuje (veľkosť písmen)
    expect(satisfiedBadges(stats({ distinctExercises: 15 }))).toContain("versatile");

    const mondays = Array.from({ length: 8 }, (_, i) => addDays("2026-09-07", 7 * i)); // pondelky
    expect(countMondayWeeks(mondays)).toBe(8);
    expect(countMondayWeeks([...mondays.slice(0, 7), "2026-11-04"])).toBe(7); // streda sa nepočíta
    expect(satisfiedBadges(stats({ mondayWeeks: 8 }))).toContain("monday_power");
  });

  test("sezónne skryté odznaky: Veľká noc (týždeň pred nedeľou až Veľkonočný pondelok), Vianoce, Silvester/Nový rok", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(easterSunday(2025)).toBe("2025-04-20");
    expect(isEasterWeek("2026-03-30")).toBe(true); // pondelok pred Veľkou nocou
    expect(isEasterWeek("2026-04-06")).toBe(true); // Veľkonočný pondelok
    expect(isEasterWeek("2026-03-29")).toBe(false);
    expect(isEasterWeek("2026-04-07")).toBe(false);
    expect(hasEasterWeekWorkout(["2026-01-05", "2026-04-04"])).toBe(true);
    expect(hasChristmasWorkout(["2025-12-24"])).toBe(true);
    expect(hasChristmasWorkout(["2025-12-27"])).toBe(false);
    for (const id of ["easter_week", "christmas", "new_year"]) {
      expect(badgeById(id)!.hidden).toBe(true);
      expect(badgeById(id)!.category).toBe("hidden");
    }
  });

  test("postup k ďalšiemu odznaku: len ďalší stupeň rodiny, najbližší prvý, skryté sa neprezradia", () => {
    const owned = new Set(["first_workout", "workouts_10"]);
    const next = nextBadges(stats({ workoutCount: 47, prCount: 4 }), owned, 3);
    const ids = next.map((n) => n.id);
    expect(ids).toContain("workouts_silver"); // nie aj workouts_gold
    expect(ids).not.toContain("workouts_gold");
    expect(ids).not.toContain("workouts_bronze"); // už získaný
    const ws = next.find((n) => n.id === "workouts_silver")!;
    expect(ws).toMatchObject({ value: 47, goal: 50, remaining: 3, unit: "workouts" });
    expect(ws.fraction).toBeCloseTo(0.94, 2);
    expect(next[0].fraction).toBeGreaterThanOrEqual(next[next.length - 1].fraction);
    expect(next.every((n) => !badgeById(n.id)!.hidden)).toBe(true);
    // objem v tonách
    expect(displayAmount("tons", 2500)).toBe(2.5);
    expect(displayAmount("workouts", 3)).toBe(3);
    // všetko získané → nič
    expect(nextBadges(stats({ workoutCount: 1000 }), new Set(BADGES.map((b) => b.id)))).toEqual([]);
  });

  test("tiché dopočítanie: nový odznak v2 z histórie sa neoslavuje, ten z práve ukončeného tréningu áno", () => {
    // pravidlo servera: silent = satisfied PRED týmto tréningom
    const before = stats({ workoutCount: 4, nightWorkouts: 5 }); // Nočná sova už z histórie
    const after = stats({ workoutCount: 5, nightWorkouts: 5, mondayWeeks: 0, earlyWorkouts: 5 });
    const missing = missingBadges(after, new Set(["first_workout"]));
    const silent = new Set(satisfiedBadges(before));
    expect(missing).toEqual(expect.arrayContaining(["night_owl", "early_bird"]));
    expect(silent.has("night_owl")).toBe(true); // historický → ticho
    expect(silent.has("early_bird")).toBe(false); // nový → oslava
  });

  test("katalóg: unikátne ID, SK aj CS text pre každý odznak, skryté len v kategórii Skryté, žiadny odznak za chudnutie", () => {
    type Texts = Record<string, { name: string; desc: string }>;
    const sk = skMessages.badges as unknown as Texts;
    const cs = csMessages.badges as unknown as Texts;
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
    for (const b of BADGES) {
      expect(sk[b.id]?.name, b.id).toBeTruthy();
      expect(cs[b.id]?.desc, b.id).toBeTruthy();
      expect(Boolean(b.hidden), b.id).toBe(b.category === "hidden");
    }
    // staré ID nemajú osirotené texty
    for (const legacy of Object.keys(LEGACY_BADGE_MAP)) expect(sk[legacy], legacy).toBeUndefined();
    expect(Object.keys(EMPTY_BADGE_STATS).some((k) => /kcal|calor|lose|weightLoss/i.test(k))).toBe(false);
  });
});

function logsInput(logs: { id: string; performedOn: string; entries?: unknown; completedAt?: string | null }[]) {
  return {
    logs: logs.map((l) => ({ id: l.id, performedOn: l.performedOn, workoutDayId: null, entries: l.entries ?? [], completedAt: l.completedAt ?? null })),
    prCount: 0,
    foodDaily: [],
    proteinTarget: null,
    bodyMetricCount: 0,
    plans: [],
    weeklyTarget: 2,
    today: "2026-11-25",
  };
}

// ================================================================ úrovne, tituly a odmeny
test.describe("úrovne a odmeny", () => {
  test("20 úrovní s plynulou krivkou: rastúce hranice a šírka úrovne", () => {
    expect(MAX_LEVEL).toBe(20);
    expect(LEVEL_FROM[0]).toBe(0);
    for (let i = 1; i < LEVEL_FROM.length; i++) expect(LEVEL_FROM[i]).toBeGreaterThan(LEVEL_FROM[i - 1]);
    const widths = LEVEL_FROM.slice(1).map((v, i) => v - LEVEL_FROM[i]);
    // šírka neklesá viac než o tretinu medzi susednými úrovňami (žiadne prudké zlomy)
    for (let i = 1; i < widths.length; i++) expect(widths[i]).toBeGreaterThanOrEqual(widths[i - 1] * 0.6);
    // prvé úrovne sú dosiahnuteľné rýchlo (10 tréningov ≈ 500 XP = úroveň 5)
    expect(levelDetail(100).n).toBe(2);
    expect(levelDetail(500).n).toBe(5);
  });

  test("skupiny Bronz…Diamant ostávajú: hranice skupín sú rovnaké ako predtým (kompatibilita s existujúcim XP)", () => {
    for (const g of LEVELS) {
      const n = LEVEL_FROM.indexOf(g.from) + 1;
      expect(n, g.id).toBeGreaterThan(0);
      expect(groupOfLevel(n)).toBe(g.id);
      expect(levelDetail(g.from).group).toBe(g.id);
      expect(levelDetail(g.from - 1 < 0 ? 0 : g.from - 1).group).toBe(g.from === 0 ? "bronze" : LEVELS[LEVELS.indexOf(g) - 1].id);
    }
    for (const xp of [0, 99, 100, 499, 500, 1499, 1500, 3999, 4000, 9999, 10_000, 25_000]) {
      expect(levelDetail(xp).group, String(xp)).toBe(levelFor(xp).level);
    }
    expect(levelDetail(0).n).toBe(1);
    expect(levelDetail(17_999).n).toBe(19);
    expect(levelDetail(18_000)).toMatchObject({ n: 20, nextN: null, toNext: null, fraction: 1, span: null });
    expect(levelDetail(-50).xp).toBe(0);
  });

  test("postup v rámci úrovne", () => {
    expect(levelDetail(160)).toMatchObject({ n: 2, into: 60, span: 120, toNext: 60, nextN: 3, fraction: 0.5 });
  });

  test("každá úroveň má titul v SK aj CS; ukážkové tituly zo zadania sedia", () => {
    const sk = skMessages.levelTitles as Record<string, string>;
    const cs = csMessages.levelTitles as Record<string, string>;
    for (let n = 1; n <= 20; n++) {
      expect(sk[String(n)], `sk ${n}`).toBeTruthy();
      expect(cs[String(n)], `cs ${n}`).toBeTruthy();
    }
    expect(new Set(Object.values(sk)).size).toBe(20);
    expect(sk["1"]).toBe("Nováčik");
    expect(sk["3"]).toBe("Rozbehnutý");
    expect(sk["5"]).toBe("Železný");
    expect(sk["8"]).toBe("Oceľový");
    expect(sk["12"]).toBe("Titan");
    expect(sk["16"]).toBe("Legenda posilňovne");
    expect(sk["20"]).toBe("Olympan");
  });

  test("odmeny: rámiky a témy sa odomykajú podľa úrovne, zmrazenie za každú 4. úroveň", () => {
    expect(unlockedFrames(1)).toEqual(["none"]);
    expect(unlockedFrames(2)).toEqual(["none", "ember"]);
    expect(unlockedFrames(20)).toEqual([...FRAME_IDS]);
    expect(unlockedThemes(1)).toEqual(["default"]);
    expect(unlockedThemes(20)).toEqual([...THEME_IDS]);
    expect(frameUnlocked("gold", FRAME_LEVEL.gold - 1)).toBe(false);
    expect(frameUnlocked("gold", FRAME_LEVEL.gold)).toBe(true);
    expect(themeUnlocked("violet", THEME_LEVEL.violet)).toBe(true);
    expect(FREEZE_LEVELS).toEqual([4, 8, 12, 16, 20]);
    expect(rewardsAt(4)).toMatchObject({ freezes: 1, frames: ["mint"] });
    expect(rewardsAt(3)).toMatchObject({ freezes: 0, themes: ["ocean"] });
    expect(rewardsAt(2)).toEqual({ frames: ["ember"], themes: [], freezes: 0 });
    // preskočené úrovne: odmeny za všetky
    const jump = rewardsBetween(1, 9);
    expect(jump.frames).toEqual(["ember", "mint", "steel", "gold"]);
    expect(jump.freezes).toBe(2);
    expect(freezeSourcesForLevel(9)).toEqual(["level:4", "level:8"]);
    expect(nextReward(1)).toMatchObject({ level: 2 });
    expect(nextReward(20)).toBeNull();
    expect(MAX_STORED_FREEZES).toBe(2);
  });

  test("uložená voľba: neplatná alebo ešte nedostupná sa zahodí", () => {
    expect(effectiveFrame("gold", 12)).toBe("gold");
    expect(effectiveFrame("gold", 3)).toBe("none");
    expect(effectiveFrame("nonsense", 20)).toBe("none");
    expect(effectiveTheme("violet", 14)).toBe("violet");
    expect(effectiveTheme("violet", 2)).toBe("default");
    expect(isFrameId("ember")).toBe(true);
    expect(isFrameId("<script>")).toBe(false);
  });

  test("texty rámikov a tém existujú v SK aj CS", () => {
    for (const lang of [skMessages, csMessages]) {
      for (const f of FRAME_IDS) expect((lang.frames as Record<string, string>)[f], f).toBeTruthy();
      for (const t of THEME_IDS) expect((lang.themes as Record<string, string>)[t], t).toBeTruthy();
    }
  });

  test("téma portálu mení farby len bez značky trénera (značka vyhráva) — statická kontrola layoutu", () => {
    const layout = readFileSync("app/portal/layout.tsx", "utf8");
    expect(layout).toContain("const themeActive = !branding && cosmetics.theme");
    expect(layout).toContain("data-fp-theme={themeActive ? cosmetics.theme : undefined}");
    // so značkou téma farbí len rámik avatara
    expect(layout).toContain("const tinted = Boolean(branding)");
    const css = readFileSync("app/components/clientThemes.module.css", "utf8");
    expect(css).toContain(".themed.themed:global([data-fp-theme");
  });
});

// ================================================================ zmrazenie série
test.describe("zmrazenie série (streak freeze)", () => {
  test("zmrazená jednotka sa preskočí: nezvyšuje sériu, ale ani neráta ako vynechanie", () => {
    // [dnes ok, týždeň -1 vynechaný, týždeň -2 vynechaný, týždeň -3 ok, týždeň -4 ok]
    const q = [true, false, false, true, true];
    expect(runLength(q).count).toBe(1); // druhé vynechanie preruší
    expect(runLength(q, new Set([2])).count).toBe(3); // zmrazený týždeň -2: séria ide ďalej
    // zmrazenie nepridáva do série (nepočíta sa ako splnený týždeň)
    expect(runLength([true, true, false, true], new Set([2])).count).toBe(3);
    // zmrazenie na indexe 1 (predošlý týždeň) nie je „ohrozenie“
    expect(runLength([false, false, true, true], new Set([1])).atRisk).toBe(false);
    expect(runLength([false, false, true, true]).atRisk).toBe(true);
  });

  test("planFreezes: spotrebuje sa len pri DRUHOM vynechaní v rade a len ak za ním séria pokračuje", () => {
    expect(planFreezes([true, false, true, true], new Set(), 2, 8)).toEqual([]); // jedno vynechanie sa toleruje zadarmo
    expect(planFreezes([true, false, false, true], new Set(), 1, 8)).toEqual([2]);
    expect(planFreezes([true, false, false, true], new Set(), 0, 8)).toEqual([]); // bez zmrazenia nič
    expect(planFreezes([true, false, false, false, false], new Set(), 2, 8)).toEqual([]); // za pauzou nič nie je — nemá čo zachraňovať
    // už chránená jednotka sa nechráni znova
    expect(planFreezes([true, false, false, true], new Set([2]), 1, 8)).toEqual([]);
    // staré pauzy (nad maxAge) sa spätne nezachraňujú
    const old = [true, ...Array(10).fill(true), false, false, true];
    expect(planFreezes(old, new Set(), 2, FREEZE_MAX_AGE_WEEKS)).toEqual([]);
    // najviac tokens použití
    const two = [true, false, false, true, false, false, true];
    expect(planFreezes(two, new Set(), 1, 8)).toHaveLength(1);
    expect(planFreezes(two, new Set(), 2, 8)).toHaveLength(2);
  });

  test("tréningová séria po týždňoch: freeze zachráni sériu cez dvojtýždennú pauzu", () => {
    const weeks = (mondays: string[]) => mondays.flatMap((m) => [m, addDays(m, 2)]);
    // týždne (pondelky): 2026-11-23 (tento), -16 vynechaný, -09 vynechaný, -02, -26.10, -19.10 splnené
    const dates = weeks(["2026-11-23", "2026-11-02", "2026-10-26", "2026-10-19"]);
    expect(computeTrainingStreak(dates, TODAY).count).toBe(1);
    const plan = planTrainingFreezes(dates, TODAY, 1);
    expect(plan).toEqual(["2026-11-09"]);
    const saved = computeTrainingStreak(dates, TODAY, undefined, plan);
    expect(saved.count).toBe(4);
    // bez tokenu plán nič nepoužije
    expect(planTrainingFreezes(dates, TODAY, 0)).toEqual([]);
    // opakované vyhodnotenie s uloženým použitím je stabilné (idempotentné)
    expect(planTrainingFreezes(dates, TODAY, 1, undefined, plan)).toEqual([]);
  });

  test("séria jedla po dňoch: freeze ochráni jeden deň", () => {
    const logged = [TODAY, addDays(TODAY, -1), addDays(TODAY, -4), addDays(TODAY, -5), addDays(TODAY, -6)]; // dni -2 a -3 vynechané
    expect(computeFoodStreak(logged, TODAY).count).toBe(2);
    const plan = planFoodFreezes(logged, TODAY, 1);
    expect(plan).toEqual([addDays(TODAY, -3)]);
    expect(computeFoodStreak(logged, TODAY, plan).count).toBe(5);
  });

  test("existujúce správanie streaku sa nemení, keď zmrazenia nie sú", () => {
    expect(runLength([true, true, false, true]).count).toBe(3);
    expect(runLength([false, false, false, true]).count).toBe(0);
    expect(computeTrainingStreak([], TODAY).count).toBe(0);
  });

  test("séria pre rebríček: snapshot s dátumom zániku (bez nového tréningu séria zanikne, uložená hodnota prestane platiť)", () => {
    const weeks = (mondays: string[]) => mondays.flatMap((m) => [m, addDays(m, 2)]);
    const dates = weeks(["2026-11-23", "2026-11-16", "2026-11-09"]);
    const snap = streakSnapshot(dates, TODAY);
    expect(snap.weeks).toBe(3);
    // bez ďalšieho tréningu: 30. 11. (týždeň +1) séria žije, 7. 12. žije (jedno vynechanie), 14. 12. už nie
    expect(snap.expiresWeek).toBe("2026-12-14");
    expect(cachedStreakValid({ streakWeeks: snap.weeks, expiresWeek: snap.expiresWeek }, "2026-12-07")).toBe(true);
    expect(cachedStreakValid({ streakWeeks: snap.weeks, expiresWeek: snap.expiresWeek }, "2026-12-14")).toBe(false);
    expect(cachedStreakValid(null, MONDAY)).toBe(false);
    expect(streakSnapshot([], TODAY)).toEqual({ weeks: 0, expiresWeek: MONDAY });
  });
});

// ================================================================ prezývka
test.describe("prezývka v rebríčku", () => {
  test("predvolená z celého mena: Meno + iniciála, priezvisko sa nikdy nezobrazí", () => {
    expect(defaultNickname("Jana Nováková")).toBe("Jana N.");
    expect(defaultNickname("Peter")).toBe("Peter");
    expect(defaultNickname("Mária Anna Kováčová")).toBe("Mária K.");
    expect(defaultNickname("  ")).toBeNull();
    expect(defaultNickname(null)).toBeNull();
    expect(defaultNickname("Jana Nováková")).toBe(maskName("Jana Nováková"));
    expect(defaultNickname("Jana Nováková")).not.toContain("Nováková");
  });

  test("validácia: 2–20 znakov, písmená/čísla/medzera/. _ -, zlúčenie medzier", () => {
    expect(NICKNAME_MIN).toBe(2);
    expect(NICKNAME_MAX).toBe(20);
    expect(validateNickname("Železná  Jana")).toEqual({ ok: true, value: "Železná Jana" });
    expect(validateNickname("  Jano_88  ")).toEqual({ ok: true, value: "Jano_88" });
    expect(validateNickname("Ľ.Š-Fit")).toEqual({ ok: true, value: "Ľ.Š-Fit" });
    expect(validateNickname("A")).toEqual({ ok: false, error: "length" });
    expect(validateNickname("")).toEqual({ ok: false, error: "length" });
    expect(validateNickname("x".repeat(21))).toEqual({ ok: false, error: "length" });
    expect(validateNickname("x".repeat(20)).ok).toBe(true);
    expect(validateNickname("Jana!")).toEqual({ ok: false, error: "chars" });
    expect(validateNickname("jana@mail.sk")).toEqual({ ok: false, error: "chars" });
    expect(validateNickname("<b>Jana</b>")).toEqual({ ok: false, error: "chars" });
    expect(validateNickname("😀😀")).toEqual({ ok: false, error: "chars" });
    expect(validateNickname("..")).toEqual({ ok: false, error: "chars" });
    expect(validateNickname(42 as unknown)).toEqual({ ok: false, error: "chars" });
    expect(validateNickname(null)).toEqual({ ok: false, error: "chars" });
  });

  test("jednoduchý filter vulgarizmov, obchádzanie (diakritika, čísla, oddeľovače) a kontakty; bežné mená prejdú", () => {
    for (const bad of ["Kokot", "k0k0t", "Ku.r.va", "FUCK", "sh1t", "Pojebaný", "p1ca", "nazi", "www.stranka.sk", "0903123456 volaj"]) {
      expect(validateNickname(bad).ok, bad).toBe(false);
    }
    expect(isBlockedNickname("Dickinson")).toBe(false);
    for (const good of ["Alex", "Dominika K.", "Spica"]) {
      expect(validateNickname(good).ok, good).toBe(true);
    }
    expect(validateNickname("Vojto 7").ok).toBe(true);
  });

  test("zobrazená prezývka: vlastná (platná), inak predvolená, inak náhrada; neplatná uložená sa ignoruje", () => {
    expect(displayNickname("Železná Jana", "Jana Nováková")).toBe("Železná Jana");
    expect(displayNickname(null, "Jana Nováková")).toBe("Jana N.");
    expect(displayNickname("", "Jana Nováková")).toBe("Jana N.");
    expect(displayNickname("kokot", "Jana Nováková")).toBe("Jana N.");
    expect(displayNickname(null, null, "Cvičenec")).toBe("Cvičenec");
  });
});

// ================================================================ celoappkový rebríček
test.describe("celoappkový rebríček", () => {
  const c = (id: string, v: Partial<GlobalClient> = {}): GlobalClient => ({ clientId: id, visible: true, workoutsWeek: 0, workoutsMonth: 0, streakWeeks: 0, prsMonth: 0, ...v });

  test("TOP 10 + vlastná pozícia mimo TOP 10 + počet v poradí (napr. 37. z 412)", () => {
    const clients: GlobalClient[] = Array.from({ length: 412 }, (_, i) => c(`c${String(i).padStart(3, "0")}`, { workoutsWeek: 412 - i }));
    const me = "c036"; // 37. v poradí
    const r = rankGlobal(clients, "workoutsWeek", me, GLOBAL_TOP_N);
    expect(r.top).toHaveLength(10);
    expect(r.top[0]).toMatchObject({ id: "c000", rank: 1, value: 412 });
    expect(r.me).toMatchObject({ id: me, rank: 37 });
    expect(r.total).toBe(412);
    expect(r.top.some((t) => t.id === me)).toBe(false);
    const board = toPublicBoard("workoutsWeek", r, me, new Map(), "—");
    expect(board.me).toEqual({ rank: 37, value: 376 });
    expect(board.total).toBe(412);
  });

  test("opt-out: skrytý klient v poradí nie je (ani v TOP, ani v počte) a nemá vlastnú pozíciu", () => {
    const clients = [c("a", { workoutsMonth: 12 }), c("b", { workoutsMonth: 9, visible: false }), c("d", { workoutsMonth: 7 }), c("e", { workoutsMonth: 3 })];
    const r = rankGlobal(clients, "workoutsMonth", "d");
    expect(r.top.map((t) => t.id)).toEqual(["a", "d", "e"]);
    expect(r.total).toBe(3);
    expect(r.me).toMatchObject({ id: "d", rank: 2 });
    expect(rankGlobal(clients, "workoutsMonth", "b").me).toBeNull();
  });

  test("len kladné hodnoty, súťažné poradie (1, 1, 3) a stabilné poradie pri zhode", () => {
    const clients = [c("z", { prsMonth: 4 }), c("a", { prsMonth: 4 }), c("m", { prsMonth: 2 }), c("n", { prsMonth: 0 })];
    const r = rankGlobal(clients, "prsMonth", "m");
    expect(r.top.map((t) => [t.id, t.rank])).toEqual([["a", 1], ["z", 1], ["m", 3]]);
    expect(r.total).toBe(3);
    expect(rankGlobal(clients, "prsMonth", "n").me).toBeNull();
    expect(rankGlobal([], "prsMonth", "x")).toEqual({ top: [], me: null, total: 0 });
  });

  test("každá metrika je samostatná (tréningy týždeň / mesiac, séria, rekordy)", () => {
    const clients = [c("a", { workoutsWeek: 1, streakWeeks: 9 }), c("b", { workoutsWeek: 3, streakWeeks: 2 })];
    expect(rankGlobal(clients, "workoutsWeek", "a").top[0].id).toBe("b");
    expect(rankGlobal(clients, "streakWeeks", "a").top[0].id).toBe("a");
  });

  test("verejný tvar: len prezývka, hodnota a príznak „ja“ — žiadne id, priezvisko ani tréner", () => {
    const clients = [c("id-a", { workoutsWeek: 5 }), c("id-b", { workoutsWeek: 3 })];
    const r = rankGlobal(clients, "workoutsWeek", "id-b");
    const board = toPublicBoard(
      "workoutsWeek",
      r,
      "id-b",
      new Map([
        ["id-a", { nickname: "Železná Jana", fullName: "Jana Nováková" }],
        ["id-b", { nickname: null, fullName: "Peter Kováč" }],
      ]),
    );
    expect(board.top).toEqual([
      { rank: 1, name: "Železná Jana", value: 5, isMe: false },
      { rank: 2, name: "Peter K.", value: 3, isMe: true },
    ]);
    const json = JSON.stringify(board);
    expect(json).not.toContain("id-a");
    expect(json).not.toContain("Nováková");
    expect(json).not.toContain("Kováč\"");
  });

  test("záložky podľa tarify trénera; klient bez trénera má sadu Starter", () => {
    expect(allowedLeaderboardMetrics(null)).toEqual(["workoutsWeek"]);
    expect(allowedLeaderboardMetrics("starter")).toEqual(["workoutsWeek"]);
    expect([...allowedLeaderboardMetrics("pro")]).toEqual([...ALL_LEADERBOARD_METRICS]);
    expect([...allowedLeaderboardMetrics("business")]).toEqual([...ALL_LEADERBOARD_METRICS]);
  });
});

// ================================================================ „Tréning v číslach“
test.describe("tréning v číslach", () => {
  const sample: FinishSummary = {
    durationMin: 52,
    volumeKg: 4310,
    sets: 18,
    exercises: 5,
    prs: 2,
    xp: 175,
    missions: [{ kind: "workouts", value: 2, goal: 3, done: false, justDone: false }, { kind: "pr_exercise", exerciseName: "Drep", value: 1, goal: 1, done: true, justDone: true }],
    bonus: false,
    streakWeeks: 4,
    needThisWeek: 1,
    freezeUsed: false,
    levelUp: null,
    weekStart: MONDAY,
  };

  test("trvanie len keď je zmysluplné (1–360 min)", () => {
    const now = Date.parse("2026-11-25T18:00:00Z");
    expect(durationMinutes(now - 52 * 60_000, now)).toBe(52);
    expect(durationMinutes(now - 20_000, now)).toBeNull(); // pod minútu
    expect(durationMinutes(now - 7 * 3_600_000, now)).toBeNull(); // starý štart
    expect(durationMinutes(now + 60_000, now)).toBeNull();
    expect(durationMinutes("x", now)).toBeNull();
    expect(durationMinutes(null, now)).toBeNull();
  });

  test("objem, série a cviky zo záznamu tréningu (server počíta sám, nie klient)", () => {
    const entries = [...sets("Drep", [100, 5], [100, 5]), { name: "Plank", sets: [{ weight: null, reps: null, durationS: 60 }] }, { name: "Prázdny", sets: [] }];
    expect(workoutNumbers(entries)).toEqual({ volumeKg: 1000, sets: 3, exercises: 2 });
    expect(workoutNumbers(null)).toEqual({ volumeKg: 0, sets: 0, exercises: 0 });
  });

  test("XP za tréning: tréning + rekordy + nové odznaky + misie + bonus", () => {
    expect(xpGained({ prs: 0, badgeIds: [], missionXp: 0, bonus: false })).toBe(50);
    expect(xpGained({ prs: 2, badgeIds: [], missionXp: 0, bonus: false })).toBe(100);
    expect(xpGained({ prs: 1, badgeIds: ["workouts_bronze", "workouts_bronze", "tank"], missionXp: 40, bonus: true })).toBe(50 + 25 + XP_BADGE.common + XP_BADGE.epic + 40 + XP_MISSION_BONUS);
  });

  test("cookie: round-trip a odmietnutie pokazeného / podvrhnutého tvaru", () => {
    expect(FINISH_COOKIE).toBe("fp_finish");
    expect(parseFinishSummary(encodeFinishSummary(sample))).toEqual(sample);
    expect(parseFinishSummary(undefined)).toBeNull();
    expect(parseFinishSummary("%7Bnie")).toBeNull();
    expect(parseFinishSummary(encodeURIComponent(JSON.stringify({ ...sample, xp: -5 })))).toBeNull();
    expect(parseFinishSummary(encodeURIComponent(JSON.stringify({ ...sample, weekStart: "<script>" })))).toBeNull();
    // neznámy druh misie sa zahodí, text cviku sa orezáva
    const parsed = parseFinishSummary(encodeURIComponent(JSON.stringify({ ...sample, missions: [{ kind: "hack", value: 1, goal: 1 }, { kind: "pr_exercise", exerciseName: "x".repeat(500), value: 1, goal: 1, done: true }] })))!;
    expect(parsed.missions).toHaveLength(1);
    expect(parsed.missions[0].exerciseName).toHaveLength(80);
  });
});

// ================================================================ statické kontroly bezpečnosti a súkromia
test.describe("migrácia 0084, súkromie a zápisy len cez server", () => {
  const sql = readFileSync("supabase/migrations/0084_gamification_v2.sql", "utf8");

  test("RLS na nových tabuľkách, klient len číta, žiadny zápis pre anon/authenticated", () => {
    for (const table of ["weekly_missions", "mission_weeks", "streak_freezes", "client_streak_cache"]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`revoke all on public.${table} from anon, authenticated`);
    }
    for (const table of ["weekly_missions", "mission_weeks", "streak_freezes"]) {
      expect(sql).toContain(`grant select on public.${table} to authenticated`);
    }
    expect(sql).not.toContain("grant select on public.client_streak_cache");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)[^;]*to\s+(authenticated|anon)/i);
    expect(sql).not.toMatch(/create policy[^;]*for (insert|update|delete|all)/i);
    expect(sql.match(/c\.user_id = auth\.uid\(\)/g)!.length).toBeGreaterThanOrEqual(3);
  });

  test("rebríčková funkcia: SECURITY DEFINER s fixným search_path, len service role, ohraničené obdobie, opt-out v SQL", () => {
    const fn = sql.slice(sql.indexOf("create or replace function public.gamification_global_leaderboard"));
    expect(fn).toMatch(/security definer/);
    expect(fn).toMatch(/set search_path = public/);
    expect(sql).toContain("revoke execute on function public.gamification_global_leaderboard(text, uuid, date, date, date, date, integer) from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.gamification_global_leaderboard(text, uuid, date, date, date, date, integer) to service_role");
    expect(fn).toContain("coalesce(gs.leaderboard_visible, true)");
    expect(fn).toContain("c.deletion_requested_at is null");
    expect(fn).toContain("'bad_range'");
    expect(fn).toContain("val > 0");
    // žiadne meno ani priezvisko sa z funkcie nevracia
    expect(fn).not.toContain("full_name");
    expect(fn).not.toContain("nickname");
  });

  test("indexy pre rebríček, idempotentné zmrazenia, oslava úrovne a CHECK poistky nastavení", () => {
    expect(sql).toContain("workout_logs_completed_on_idx");
    expect(sql).toContain("client_achievements_pr_on_idx");
    expect(sql).toContain("streak_freezes_source_unique unique (client_id, source)");
    expect(sql).toContain("streak_freezes_unit_unique");
    expect(sql).toContain("weekly_missions_slot_unique unique (client_id, week_start, slot)");
    expect(sql).toMatch(/kind in \('pr', 'badge', 'challenge', 'level'\)/);
    expect(sql).toContain("client_achievements_level_unique");
    expect(sql).toContain("char_length(nickname) between 2 and 20");
    expect(sql).toContain("avatar_frame");
    expect(sql).toContain("portal_theme");
    // len nová migrácia — žiadne mazanie tabuliek ani dát
    expect(sql).not.toMatch(/drop table|delete from|truncate/i);
  });

  test("server: rebríček neposiela id ani mená, nečíta nastavenie trénera; zápisy cez service role po overení", () => {
    const lb = readFileSync("lib/gamification/leaderboardServer.ts", "utf8");
    expect(lb).toContain("toPublicBoard(");
    expect(lb).not.toContain("leaderboard_enabled");
    const actions = readFileSync("app/portal/gamificationActions.ts", "utf8");
    for (const fn of ["setNicknameAction", "setFrameAction", "setThemeAction"]) expect(actions).toContain(`export async function ${fn}`);
    expect(actions).toContain("validateNickname(raw)");
    expect(actions).toContain("frameUnlocked(frame, level)");
    expect(actions).toContain("themeUnlocked(theme, level)");
    expect(actions).toContain("tryCreateAdminClient()");
    const missions = readFileSync("lib/gamification/missionsServer.ts", "utf8");
    expect(missions).toContain('onConflict: "client_id,week_start,slot"');
    expect(missions).toContain('.is("completed_at", null)');
    const finish = readFileSync("app/portal/actions.ts", "utf8");
    expect(finish).toContain("setFinishSummaryCookie(");
  });

  test("zásady ochrany súkromia (SK + CS): celoappkový rebríček, len prezývka, opt-out, oprávnený záujem, TODO pre právnika ostáva", () => {
    const sk = readFileSync("app/ochrana-sukromia/content.sk.tsx", "utf8");
    const cs = readFileSync("app/ochrana-sukromia/content.cs.tsx", "utf8");
    for (const src of [sk, cs]) {
      expect(src).toContain("TODO(právnik)");
      expect(src).not.toMatch(/(toho istého trénera|stejného trenéra)/);
    }
    expect(sk).toContain("celoappkový");
    expect(sk).toContain("iba tvoja prezývka");
    expect(sk).toContain("opt-out");
    expect(sk).toContain("oprávnený záujem");
    expect(cs).toContain("celoaplikační");
    expect(cs).toContain("pouze tvá přezdívka");
    expect(cs).toContain("opt-out");
    expect(cs).toContain("oprávněný zájem");
  });

  test("preklady SK + CS: rovnaké kľúče a nové sekcie existujú", () => {
    function keys(o: unknown, prefix = ""): string[] {
      if (!o || typeof o !== "object") return [prefix];
      return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
    }
    expect(keys(csMessages).sort()).toEqual(keys(skMessages).sort());
    for (const section of ["missions", "hints", "finish", "next", "freeze", "rewards", "levelTitles", "frames", "themes", "tiers"]) {
      expect(Object.keys(skMessages)).toContain(section);
    }
    // nastavenie rebríčka u trénera už neexistuje
    expect(Object.keys(skMessages.leaderboard)).not.toContain("trainer");
  });
});
