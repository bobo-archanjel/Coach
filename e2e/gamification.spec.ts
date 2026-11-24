import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  BADGES,
  EMPTY_BADGE_STATS,
  bestFoodStreakDays,
  bestRun,
  bestTrainingStreakWeeks,
  buildBadgeViews,
  hasCompletedPlan,
  hasNewYearWorkout,
  hasProteinWeek,
  isBadgeRevealed,
  missingBadges,
  satisfiedBadges,
  badgeById,
  type BadgeStats,
} from "../lib/gamification/badges";
import { detectPersonalRecords, summarizeRecords, totalVolumeKg } from "../lib/gamification/records";
import { computeRings, proteinDaysMet, proteinMet, weekDates } from "../lib/gamification/rings";
import { buildGamificationHome, computeBadgeStats, proteinByDay, ringTarget } from "../lib/gamification/stats";
import { LEVELS, XP_BADGE, XP_FOOD_DAY, XP_PR, XP_WORKOUT, computeXp, levelFor } from "../lib/gamification/xp";
import { isValidClientDismissKey, highFiveDismissKey } from "../lib/portal/attention";

/**
 * Gamifikácia klienta, fáza A — čistá logika bez DB/prehliadača: detekcia osobných rekordov,
 * matematika prstencov, pravidlá každého odznaku, XP a úrovne, idempotencia pripisovania
 * (čistá funkcia vráti len chýbajúce odznaky) a zobrazenie skrytých odznakov.
 */

const log = (id: string, performedOn: string, entries: unknown, createdAt?: string) => ({ id, performedOn, createdAt, entries });
const squat = (...sets: [number, number][]) => [{ name: "Drep", sets: sets.map(([weight, reps]) => ({ weight, reps })) }];
const stats = (patch: Partial<BadgeStats>): BadgeStats => ({ ...EMPTY_BADGE_STATS, ...patch });

// ---------------------------------------------------------------- osobné rekordy
test.describe("detectPersonalRecords", () => {
  test("prvý zápis cviku nie je rekord, vyššia váha ďalší deň je", () => {
    const events = detectPersonalRecords([log("a", "2026-01-05", squat([100, 5])), log("b", "2026-01-12", squat([105, 3]))]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ exerciseKey: "drep", prType: "weight", weightKg: 105, reps: 3, sourceLogId: "b", achievedOn: "2026-01-12" });
  });

  test("remíza ani nižšia váha nie je rekord", () => {
    expect(detectPersonalRecords([log("a", "2026-01-05", squat([100, 5])), log("b", "2026-01-12", squat([100, 5])), log("c", "2026-01-19", squat([95, 5]))])).toHaveLength(0);
  });

  test("rovnaká váha s lepším odhadom 1RM (viac opakovaní) je rekord typu e1rm", () => {
    const events = detectPersonalRecords([log("a", "2026-01-05", squat([100, 3])), log("b", "2026-01-12", squat([100, 8]))]);
    expect(events).toHaveLength(1);
    expect(events[0].prType).toBe("e1rm");
    expect(events[0].e1rm).toBeGreaterThan(110);
  });

  test("padnú obe kritériá → jeden rekord typu weight", () => {
    const events = detectPersonalRecords([log("a", "2026-01-05", squat([100, 5])), log("b", "2026-01-12", squat([110, 5]))]);
    expect(events).toHaveLength(1);
    expect(events[0].prType).toBe("weight");
  });

  test("váha sa porovnáva so VŠETKÝM predošlým, nielen s posledným tréningom", () => {
    const events = detectPersonalRecords([
      log("a", "2026-01-05", squat([120, 1])),
      log("b", "2026-01-12", squat([100, 5])),
      log("c", "2026-01-19", squat([110, 5])),
    ]);
    // 110 kg × 5 má odhad 1RM 128,3 > 120, takže je rekord e1rm; čistá váha 110 < 120 rekord nie je
    expect(events.map((e) => [e.sourceLogId, e.prType])).toEqual([["c", "e1rm"]]);
  });

  test("poradie vstupu nehrá rolu (zoradí sa podľa dátumu), názov cviku sa zjednocuje", () => {
    const events = detectPersonalRecords([
      log("b", "2026-01-12", [{ name: "  DREP ", sets: [{ weight: 105, reps: 3 }] }]),
      log("a", "2026-01-05", squat([100, 5])),
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].exerciseKey).toBe("drep");
  });

  test("cviky bez váhy a série bez opakovaní rekord nemajú", () => {
    const events = detectPersonalRecords([
      log("a", "2026-01-05", [{ name: "Zhyby", sets: [{ weight: null, reps: 10 }] }]),
      log("b", "2026-01-12", [{ name: "Zhyby", sets: [{ weight: null, reps: 15 }] }]),
      log("c", "2026-01-19", [{ name: "Drep", sets: [{ weight: 200, reps: 0 }] }]),
      log("d", "2026-01-26", [{ name: "Drep", sets: [{ weight: 100, reps: 5 }] }]),
    ]);
    expect(events).toHaveLength(0);
  });

  test("viac cvikov v jednom tréningu = viac rekordov, jeden na cvik a tréning", () => {
    const entries = (sq: number, bp: number) => [
      { name: "Drep", sets: [{ weight: sq, reps: 5 }, { weight: sq - 10, reps: 8 }] },
      { name: "Bench", sets: [{ weight: bp, reps: 5 }] },
    ];
    const events = detectPersonalRecords([log("a", "2026-01-05", entries(100, 60)), log("b", "2026-01-12", entries(110, 65))]);
    expect(events.map((e) => e.exerciseKey).sort()).toEqual(["bench", "drep"]);
    expect(new Set(events.map((e) => `${e.exerciseKey}:${e.sourceLogId}`)).size).toBe(events.length);
  });

  test("živé vyhodnotenie = udalosti práve ukončeného tréningu, backfill = všetky; výsledok je deterministický", () => {
    const history = [log("a", "2026-01-05", squat([100, 5])), log("b", "2026-01-12", squat([105, 3])), log("c", "2026-01-19", squat([110, 3]))];
    const all = detectPersonalRecords(history);
    expect(all.map((e) => e.sourceLogId)).toEqual(["b", "c"]);
    expect(detectPersonalRecords(history)).toEqual(all);
    expect(all.filter((e) => e.sourceLogId === "c")).toHaveLength(1);
  });

  test("summarizeRecords: najlepšia váha a odhad 1RM na cvik, najnovšie hore", () => {
    const events = detectPersonalRecords([
      log("a", "2026-01-05", squat([100, 5])),
      log("b", "2026-01-12", squat([110, 3])),
      log("c", "2026-02-02", [{ name: "Bench", sets: [{ weight: 60, reps: 5 }] }]),
      log("d", "2026-02-09", [{ name: "Bench", sets: [{ weight: 65, reps: 5 }] }]),
    ]);
    const sum = summarizeRecords(events);
    expect(sum.map((r) => r.exerciseKey)).toEqual(["bench", "drep"]);
    expect(sum[1]).toMatchObject({ bestWeightKg: 110, bestWeightReps: 3, lastOn: "2026-01-12", count: 1 });
  });

  test("totalVolumeKg sčíta kg × opakovania len zo sérií s váhou", () => {
    expect(
      totalVolumeKg([
        { entries: squat([100, 5], [50, 10]) },
        { entries: [{ name: "Zhyby", sets: [{ weight: null, reps: 10 }] }] },
        { entries: "nie je pole" },
      ]),
    ).toBe(1000);
  });
});

// ---------------------------------------------------------------- prstence
test.describe("prstence týždňa", () => {
  test("tréningový cieľ z počtu dní plánu (1–7), bez plánu 2", () => {
    expect(ringTarget(null)).toBe(2);
    expect(ringTarget(0)).toBe(2);
    expect(ringTarget(4)).toBe(4);
    expect(ringTarget(12)).toBe(7);
  });

  test("computeRings: podiel sa orezáva na 1, jedlo vždy voči 7", () => {
    const rings = computeRings({ workoutDays: 5, workoutTarget: 3, foodDays: 3, proteinDays: 0, proteinTarget: 140 });
    expect(rings.map((r) => r.id)).toEqual(["training", "food", "protein"]);
    expect(rings[0]).toMatchObject({ value: 5, goal: 3, fraction: 1, done: true });
    expect(rings[1]).toMatchObject({ value: 3, goal: 7, done: false });
    expect(rings[1].fraction).toBeCloseTo(3 / 7);
    expect(rings[2]).toMatchObject({ value: 0, fraction: 0 });
  });

  test("bielkovinový prstenec sa skryje bez cieľa", () => {
    expect(computeRings({ workoutDays: 0, workoutTarget: 2, foodDays: 0, proteinDays: 0, proteinTarget: null }).map((r) => r.id)).toEqual(["training", "food"]);
    expect(computeRings({ workoutDays: 0, workoutTarget: 2, foodDays: 0, proteinDays: 0, proteinTarget: 0 })).toHaveLength(2);
  });

  test("cieľ bielkovín: od 90 % vyššie je splnený, pod nie, bez cieľa nikdy", () => {
    expect(proteinMet(126, 140)).toBe(true);
    expect(proteinMet(125.9, 140)).toBe(false);
    expect(proteinMet(300, 140)).toBe(true);
    expect(proteinMet(100, null)).toBe(false);
    expect(proteinMet(100, 0)).toBe(false);
  });

  test("proteinDaysMet počíta len dni v rozsahu", () => {
    const daily: [string, number][] = [["2026-09-14", 150], ["2026-09-15", 80], ["2026-09-16", 140], ["2026-09-21", 200]];
    expect(proteinDaysMet(daily, 140, "2026-09-14", "2026-09-20")).toBe(2);
    expect(weekDates("2026-09-14")).toHaveLength(7);
  });

  test("buildGamificationHome: dni mimo aktuálneho týždňa sa nerátajú, viac tréningov v ten istý deň = jeden deň", () => {
    // 2026-09-16 = streda, týždeň 14.–20. 9.
    const home = buildGamificationHome(
      { workouts: 3, foodDays: 5, prCount: 1, badgeIds: ["first_workout"], proteinTarget: 140, weekFood: [{ date: "2026-09-15", protein: 150 }, { date: "2026-09-16", protein: 50 }] },
      { planDays: 3, trainedDates: ["2026-09-13", "2026-09-14", "2026-09-14", "2026-09-16"], foodDates: ["2026-09-13", "2026-09-15", "2026-09-16"], today: "2026-09-16" },
    );
    expect(home.rings[0]).toMatchObject({ value: 2, goal: 3 });
    expect(home.rings[1]).toMatchObject({ value: 2, goal: 7 });
    expect(home.rings[2]).toMatchObject({ value: 1, goal: 7 });
    expect(home.badgeCount).toBe(1);
    expect(home.xp.total).toBe(3 * XP_WORKOUT + 5 * XP_FOOD_DAY + XP_PR + XP_BADGE.common);
  });

  test("proteinByDay sčíta gramáž × bielkoviny / 100 po dňoch", () => {
    expect(proteinByDay([{ eaten_on: "2026-09-15", grams: 200, protein_100g: 20 }, { eaten_on: "2026-09-15", grams: 100, protein_100g: 10 }])).toEqual([{ date: "2026-09-15", protein: 50 }]);
  });
});

// ---------------------------------------------------------------- odznaky
test.describe("katalóg odznakov", () => {
  test("unikátne id, každý má SK aj CS text a skryté sú len v kategórii Skryté", () => {
    type Texts = Record<string, { name: string; desc: string }>;
    const sk = JSON.parse(readFileSync("messages/sk/gamification.json", "utf8")).badges as Texts;
    const cs = JSON.parse(readFileSync("messages/cs/gamification.json", "utf8")).badges as Texts;
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
    for (const b of BADGES) {
      expect(sk[b.id]?.name, b.id).toBeTruthy();
      expect(sk[b.id]?.desc, b.id).toBeTruthy();
      expect(cs[b.id]?.name, b.id).toBeTruthy();
      expect(cs[b.id]?.desc, b.id).toBeTruthy();
      expect(Boolean(b.hidden), b.id).toBe(b.category === "hidden");
    }
  });

  test("Vytrvalosť: prvý tréning a 10/25/50/100/250", () => {
    expect(satisfiedBadges(stats({ workoutCount: 0 }))).toEqual([]);
    expect(satisfiedBadges(stats({ workoutCount: 1 }))).toEqual(["first_workout"]);
    const at = (n: number) => satisfiedBadges(stats({ workoutCount: n })).filter((id) => id.startsWith("workouts_"));
    expect(at(9)).toEqual([]);
    expect(at(10)).toEqual(["workouts_10"]);
    expect(at(25)).toEqual(["workouts_10", "workouts_25"]);
    expect(at(250)).toEqual(["workouts_10", "workouts_25", "workouts_50", "workouts_100", "workouts_250"]);
  });

  test("Vytrvalosť: séria týždňov 4/12/26/52", () => {
    const at = (n: number) => satisfiedBadges(stats({ bestTrainingStreakWeeks: n })).filter((id) => id.startsWith("streak_"));
    expect(at(3)).toEqual([]);
    expect(at(4)).toEqual(["streak_4w"]);
    expect(at(12)).toEqual(["streak_4w", "streak_12w"]);
    expect(at(52)).toEqual(["streak_4w", "streak_12w", "streak_26w", "streak_52w"]);
  });

  test("Sila: prvý rekord, 10 rekordov, objem 1 t / 10 t / 50 t / 100 t", () => {
    expect(satisfiedBadges(stats({ prCount: 1 }))).toEqual(["first_pr"]);
    expect(satisfiedBadges(stats({ prCount: 10 }))).toEqual(["first_pr", "prs_10"]);
    const vol = (kg: number) => satisfiedBadges(stats({ totalVolumeKg: kg })).filter((id) => id.startsWith("volume_"));
    expect(vol(999)).toEqual([]);
    expect(vol(1000)).toEqual(["volume_1t"]);
    expect(vol(10_000)).toEqual(["volume_1t", "volume_10t"]);
    expect(vol(100_000)).toEqual(["volume_1t", "volume_10t", "volume_50t", "volume_100t"]);
  });

  test("Strava: jedlo 7 / 30 dní v rade a týždeň s cieľom bielkovín", () => {
    expect(satisfiedBadges(stats({ bestFoodStreakDays: 6 }))).toEqual([]);
    expect(satisfiedBadges(stats({ bestFoodStreakDays: 7 }))).toEqual(["food_streak_7"]);
    expect(satisfiedBadges(stats({ bestFoodStreakDays: 30 }))).toEqual(["food_streak_7", "food_streak_30"]);
    expect(satisfiedBadges(stats({ proteinWeek: true }))).toEqual(["protein_week"]);
  });

  test("Progres: prvé meranie a celý plán", () => {
    expect(satisfiedBadges(stats({ bodyMetricCount: 1 }))).toEqual(["first_measurement"]);
    expect(satisfiedBadges(stats({ planAllDaysDone: true }))).toEqual(["plan_all_days"]);
  });

  test("Skryté: tréning na Silvestra a Nový rok", () => {
    expect(satisfiedBadges(stats({ newYearWorkout: true }))).toEqual(["new_year"]);
    expect(hasNewYearWorkout(["2025-06-01", "2025-12-31"])).toBe(true);
    expect(hasNewYearWorkout(["2026-01-01"])).toBe(true);
    expect(hasNewYearWorkout(["2025-12-30", "2026-01-02"])).toBe(false);
  });

  test("žiadny odznak za chudnutie ani kalórie — katalóg nemá takú kategóriu ani pravidlo", () => {
    const stat = Object.keys(EMPTY_BADGE_STATS);
    expect(stat.some((k) => /weight(?!Kg)|kcal|calor|lose/i.test(k))).toBe(false);
  });
});

test.describe("pravidlá odznakov nad históriou", () => {
  const TODAY = "2026-09-16"; // streda
  const daysBack = (n: number) => new Date(new Date(`${TODAY}T12:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10);

  test("bestRun toleruje jedno vynechanie, druhé v rade preruší", () => {
    expect(bestRun([true, true, false, true, true])).toBe(4);
    expect(bestRun([true, true, false, false, true, true])).toBe(2);
    expect(bestRun([])).toBe(0);
    expect(bestRun([false, false])).toBe(0);
  });

  test("najdlhšia séria tréningových týždňov sa zachová aj po prerušení", () => {
    // 5 týždňov po 2 dni (staršie), potom pauza 3 týždne, potom 1 týždeň
    const dates: string[] = [];
    for (let w = 12; w >= 8; w--) dates.push(daysBack(w * 7), daysBack(w * 7 + 1));
    dates.push(daysBack(0));
    expect(bestTrainingStreakWeeks(dates, TODAY, 2)).toBe(5);
    expect(bestTrainingStreakWeeks([], TODAY, 2)).toBe(0);
  });

  test("séria jedla po dňoch: 30 dní v rade", () => {
    const dates = Array.from({ length: 30 }, (_, i) => daysBack(i + 1));
    expect(bestFoodStreakDays(dates, TODAY)).toBe(30);
    expect(satisfiedBadges(stats({ bestFoodStreakDays: bestFoodStreakDays(dates, TODAY) }))).toContain("food_streak_30");
    expect(bestFoodStreakDays([], TODAY)).toBe(0);
  });

  test("týždeň s bielkovinami: ≥ 5 dní v jednom týždni (po–ne), nie rozložené cez dva", () => {
    expect(hasProteinWeek(["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"])).toBe(true);
    expect(hasProteinWeek(["2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21"])).toBe(false);
    expect(hasProteinWeek(["2026-09-14", "2026-09-14", "2026-09-15"])).toBe(false);
  });

  test("celý plán: každý deň aspoň raz, plán má ≥ 2 dni", () => {
    const plans = [{ dayIds: ["d1", "d2", "d3"] }, { dayIds: ["x1"] }];
    expect(hasCompletedPlan(plans, new Set(["d1", "d2"]))).toBe(false);
    expect(hasCompletedPlan(plans, new Set(["d1", "d2", "d3"]))).toBe(true);
    expect(hasCompletedPlan(plans, new Set(["x1"]))).toBe(false);
  });

  test("computeBadgeStats poskladá všetky vstupy", () => {
    const s = computeBadgeStats({
      logs: [
        { id: "a", performedOn: "2025-12-31", workoutDayId: "d1", entries: squat([100, 10]) },
        { id: "b", performedOn: "2026-01-02", workoutDayId: "d2", entries: [] },
      ],
      prCount: 2,
      foodDaily: [{ date: "2026-09-14", protein: 150 }],
      proteinTarget: 140,
      bodyMetricCount: 1,
      plans: [{ dayIds: ["d1", "d2"] }],
      weeklyTarget: 2,
      today: TODAY,
    });
    expect(s).toMatchObject({ workoutCount: 2, prCount: 2, totalVolumeKg: 1000, bodyMetricCount: 1, planAllDaysDone: true, newYearWorkout: true, proteinWeek: false });
  });
});

// ---------------------------------------------------------------- idempotencia a skryté odznaky
test.describe("pripisovanie odznakov", () => {
  test("missingBadges vráti len splnené a ešte nepripísané — opakované volanie nič nezdvojí", () => {
    const s = stats({ workoutCount: 10, prCount: 1 });
    const first = missingBadges(s, new Set());
    expect(first).toEqual(["first_workout", "workouts_10", "first_pr"]);
    // po pripísaní nie je čo dopísať
    expect(missingBadges(s, new Set(first))).toEqual([]);
    // nový tréning prinesie len ten jediný nový odznak
    const next = missingBadges(stats({ workoutCount: 25, prCount: 1 }), new Set(first));
    expect(next).toEqual(["workouts_25"]);
  });

  test("filter podľa spúšťača: jedlo nepripíše odznaky za tréning", () => {
    const s = stats({ workoutCount: 100, bestFoodStreakDays: 7 });
    expect(missingBadges(s, new Set(), ["food"])).toEqual(["food_streak_7"]);
    expect(missingBadges(s, new Set(), ["body"])).toEqual([]);
  });

  test("skrytý odznak je „???“ do získania, potom sa odhalí", () => {
    const def = badgeById("new_year")!;
    expect(isBadgeRevealed(def, false)).toBe(false);
    expect(isBadgeRevealed(def, true)).toBe(true);
    expect(isBadgeRevealed(badgeById("first_workout")!, false)).toBe(true);

    const views = buildBadgeViews(new Map([["first_workout", "2026-09-01"]]));
    const hidden = views.find((v) => v.id === "new_year")!;
    expect(hidden).toMatchObject({ earned: false, revealed: false });
    const first = views.find((v) => v.id === "first_workout")!;
    expect(first).toMatchObject({ earned: true, revealed: true, earnedOn: "2026-09-01" });
    expect(views.find((v) => v.id === "workouts_10")).toMatchObject({ earned: false, revealed: true });
    expect(buildBadgeViews(new Map([["new_year", "2027-01-01"]])).find((v) => v.id === "new_year")).toMatchObject({ earned: true, revealed: true });
  });
});

// ---------------------------------------------------------------- XP a úrovne
test.describe("XP a úrovne", () => {
  test("computeXp: tréning 50, deň so zápisom 10, rekord 25, odznak podľa vzácnosti", () => {
    expect(computeXp({ workouts: 2, foodDays: 3, prs: 1, badgeIds: [] }).total).toBe(100 + 30 + 25);
    const x = computeXp({ workouts: 0, foodDays: 0, prs: 0, badgeIds: ["first_workout", "workouts_50", "workouts_250"] });
    expect(x.badges).toBe(XP_BADGE.common + XP_BADGE.rare + XP_BADGE.epic);
  });

  test("XP je deterministické a odolné: duplicity, neznáme odznaky a záporné čísla", () => {
    const input = { workouts: 4, foodDays: 10, prs: 2, badgeIds: ["first_workout", "first_workout", "neexistuje"] };
    expect(computeXp(input)).toEqual(computeXp(input));
    expect(computeXp(input).badges).toBe(XP_BADGE.common);
    expect(computeXp({ workouts: -5, foodDays: -1, prs: -1, badgeIds: [] }).total).toBe(0);
  });

  test("hranice úrovní Bronz → Striebro → Zlato → Platina → Diamant", () => {
    expect(LEVELS.map((l) => [l.id, l.from])).toEqual([["bronze", 0], ["silver", 500], ["gold", 1500], ["platinum", 4000], ["diamond", 10000]]);
    expect(levelFor(0).level).toBe("bronze");
    expect(levelFor(499).level).toBe("bronze");
    expect(levelFor(500).level).toBe("silver");
    expect(levelFor(1499).level).toBe("silver");
    expect(levelFor(1500).level).toBe("gold");
    expect(levelFor(4000).level).toBe("platinum");
    expect(levelFor(10000).level).toBe("diamond");
    expect(levelFor(999_999).level).toBe("diamond");
  });

  test("postup v rámci úrovne a najvyššia úroveň", () => {
    expect(levelFor(250)).toMatchObject({ into: 250, span: 500, next: "silver", toNext: 250, fraction: 0.5 });
    expect(levelFor(1000)).toMatchObject({ level: "silver", into: 500, span: 1000, toNext: 500 });
    expect(levelFor(12_000)).toMatchObject({ next: null, span: null, toNext: null, fraction: 1 });
    expect(levelFor(-5).xp).toBe(0);
  });
});

// ---------------------------------------------------------------- zvonček
test.describe("high five v zvončeku", () => {
  test("kľúč hf:<id> prejde validáciou, cudzí tvar nie", () => {
    expect(isValidClientDismissKey(highFiveDismissKey("3f9dc73e-aaaa-bbbb-cccc-0123456789ab"))).toBe(true);
    expect(isValidClientDismissKey("hf:")).toBe(false);
    expect(isValidClientDismissKey("xx:abc")).toBe(false);
  });
});
