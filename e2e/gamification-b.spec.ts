// i18n-ignore-file: testy gamifikácie fáza B — čisté testy bez siete a bez DB (vymyslené mená a texty)
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  CHALLENGE_METRICS,
  MAX_ACTIVE_CHALLENGES,
  challengeProgress,
  challengeStatus,
  challengeValue,
  longestWeekRun,
  effectiveStartMs,
  newlyCompleted,
  targetBounds,
  validateChallenge,
  windowDays,
  windowWeeks,
  type ChallengeMetric,
  type ProgressData,
} from "../lib/gamification/challenges";
import { LEADERBOARD_METRICS, LEADERBOARD_TOP_N, buildLeaderboard, maskName, streakFromWeeks, type BoardClient } from "../lib/gamification/leaderboard";
import { buildTeamWeek, buildWeeklySummary, isSummaryDue, summaryWeekFor } from "../lib/gamification/weekly";
import {
  DEFAULT_SHARE_BRAND,
  firstNameOf,
  pickAchievementCard,
  pickShareBrand,
  pickWeeklyCard,
} from "../lib/gamification/shareCard";
import { challengeNameOf } from "../lib/gamification/kinds";
import { challengesUnlocked, leaderboardUnlocked } from "../lib/gamification/gate";
import { ALL_CHALLENGE_TYPES, ALL_LEADERBOARD_METRICS, PLANS } from "../lib/billing/plans";
import { allowedLeaderboardMetrics, checkChallengeAgainstLimits, gamificationLimits } from "../lib/gamification/limits";
import { computeBilling, featureAvailableForClients, type SubscriptionRow } from "../lib/billing/entitlements";
import { deriveBrandTheme } from "../lib/branding/colors";
import { applyDismissals, attentionTotal, buildAttentionItems, challengeDismissKey, isValidDismissKey } from "../lib/dashboard/attention";
import skMessages from "../messages/sk/gamification.json";
import csMessages from "../messages/cs/gamification.json";

/**
 * Gamifikácia klienta, fáza B — výzvy (progres podľa typu, dokončenie idempotentne, validácia),
 * rebríček (poradie, opt-out, maskovanie mien), týždenný súhrn (matematika), zdieľacie karty
 * (značka vs FitPilot), tarifné brány a statické kontroly bezpečnosti migrácie 0079.
 */

const TODAY = "2026-11-25"; // streda
const W = { startsOn: "2026-11-02", endsOn: "2026-11-29" }; // 4 týždne (po–ne)
const sets = (...s: [number, number][]) => [{ name: "Drep", sets: s.map(([weight, reps]) => ({ weight, reps })) }];
const data = (over: Partial<ProgressData> = {}): ProgressData => ({ logs: [], foodDates: [], prDates: [], ...over });

// ---------------------------------------------------------------- výzvy: progres podľa typu
test.describe("progres výzvy podľa typu", () => {
  test("workouts: počíta len tréningy v období a nie po dnešku", () => {
    const d = data({
      logs: [
        { performedOn: "2026-11-01" }, // pred začiatkom
        { performedOn: "2026-11-03" },
        { performedOn: "2026-11-03" }, // dva tréningy v ten istý deň = dva tréningy
        { performedOn: "2026-11-24" },
        { performedOn: "2026-11-30" }, // po konci
      ],
    });
    expect(challengeValue("workouts", W, d, TODAY)).toBe(3);
    // „dnes“ pred koncom: tréning z budúcnosti sa nepočíta
    expect(challengeValue("workouts", W, d, "2026-11-10")).toBe(2);
  });

  test("food_days: odlišné dni so zápisom v období", () => {
    const d = data({ foodDates: ["2026-11-01", "2026-11-02", "2026-11-02", "2026-11-05", "2026-12-02"] });
    expect(challengeValue("food_days", W, d, TODAY)).toBe(2);
  });

  test("prs: osobné rekordy podľa dátumu rekordu", () => {
    const d = data({ prDates: ["2026-10-30", "2026-11-04", "2026-11-20", "2026-11-26"] });
    expect(challengeValue("prs", W, d, TODAY)).toBe(2);
  });

  test("volume_kg: súčet váha × opakovania len z tréningov v období", () => {
    const d = data({
      logs: [
        { performedOn: "2026-11-03", entries: sets([100, 5], [80, 10]) }, // 500 + 800
        { performedOn: "2026-10-30", entries: sets([200, 10]) }, // mimo
        { performedOn: "2026-11-10", entries: sets([50, 4]) }, // 200
      ],
    });
    expect(challengeValue("volume_kg", W, d, TODAY)).toBe(1500);
  });

  test("streak_weeks: najdlhší beh týždňov s ≥ 2 tréningovými dňami (bez tolerancie)", () => {
    // týždne: 2.11., 9.11., 16.11., 23.11.
    const days = ["2026-11-02", "2026-11-04", "2026-11-09", "2026-11-11", "2026-11-17", "2026-11-23", "2026-11-25"];
    // týždeň 16.11. má len 1 deň → beh 2, potom 1 (23.11. má 2 dni)
    expect(longestWeekRun(days, W, TODAY)).toBe(2);
    const full = [...days, "2026-11-18"];
    expect(longestWeekRun(full, W, TODAY)).toBe(4);
    const d = data({ logs: full.map((performedOn) => ({ performedOn })) });
    expect(challengeValue("streak_weeks", W, d, TODAY)).toBe(4);
  });

  test("progres: zlomok je orezaný na 1 a done pri dosiahnutí cieľu", () => {
    const d = data({ logs: Array.from({ length: 5 }, (_, i) => ({ performedOn: `2026-11-0${i + 2}` })) });
    const p = challengeProgress({ ...W, metric: "workouts", target: 4 }, d, TODAY);
    expect(p).toMatchObject({ value: 5, target: 4, fraction: 1, done: true });
    const half = challengeProgress({ ...W, metric: "workouts", target: 10 }, d, TODAY);
    expect(half).toMatchObject({ value: 5, fraction: 0.5, done: false });
  });

  test("stav podľa dátumov a ručné ukončenie", () => {
    expect(challengeStatus(W, "2026-10-30")).toBe("upcoming");
    expect(challengeStatus(W, TODAY)).toBe("active");
    expect(challengeStatus(W, "2026-12-01")).toBe("over");
    expect(challengeStatus({ ...W, status: "ended" }, TODAY)).toBe("ended");
  });
});

// ---------------------------------------------------------------- výzvy: dokončenie je idempotentné
test.describe("detekcia dokončenia výzvy", () => {
  const ch = (id: string, over: Partial<{ target: number; metric: ChallengeMetric; status: "active" | "ended"; startsOn: string; endsOn: string }> = {}) => ({
    id,
    startsOn: W.startsOn,
    endsOn: W.endsOn,
    metric: "workouts" as ChallengeMetric,
    target: 2,
    status: "active" as const,
    ...over,
  });
  const done2 = data({ logs: [{ performedOn: "2026-11-03" }, { performedOn: "2026-11-04" }] });

  test("dokončí splnenú výzvu raz; už dokončená sa nikdy nevráti", () => {
    const challenges = [ch("a"), ch("b", { target: 9 })];
    const first = newlyCompleted(challenges, [{ challengeId: "a", completedAt: null }, { challengeId: "b", completedAt: null }], () => done2, TODAY);
    expect(first).toEqual(["a"]);
    // po zápise completed_at (to robí server podmienkou `completed_at is null`) sa nič nezopakuje
    const second = newlyCompleted(challenges, [{ challengeId: "a", completedAt: "2026-11-25T10:00:00Z" }, { challengeId: "b", completedAt: null }], () => done2, TODAY);
    expect(second).toEqual([]);
    // opakované vyhodnotenie bez zmeny stavu dáva ten istý výsledok (čistá funkcia)
    expect(newlyCompleted(challenges, [{ challengeId: "a", completedAt: null }], () => done2, TODAY)).toEqual(first);
  });

  test("neúčastník, ukončená a nezačatá výzva sa nedokončí", () => {
    const rows = [ch("x"), ch("ended", { status: "ended" }), ch("future", { startsOn: "2026-12-01", endsOn: "2026-12-20" }), ch("over", { startsOn: "2026-10-01", endsOn: "2026-10-31" })];
    const parts = ["ended", "future", "over"].map((challengeId) => ({ challengeId, completedAt: null }));
    expect(newlyCompleted(rows, parts, () => done2, TODAY)).toEqual([]);
  });
});

// ---------------------------------------------------------------- výzvy: počíta sa len od vytvorenia
test.describe("výzva počíta len aktivitu po vytvorení", () => {
  // vytvorená v stredu 25.11.2026 o 10:00 (CET = 09:00Z), začiatok dnes
  const C = { startsOn: TODAY, endsOn: "2026-12-20", createdAt: "2026-11-25T09:00:00Z" };
  const before = "2026-11-25T08:00:00Z"; // 09:00 miestne — pred vytvorením
  const after = "2026-11-25T11:30:00Z";

  test("efektívny začiatok: neskorší z vytvorenia a začiatku dňa; budúci začiatok = 00:00 toho dňa", () => {
    expect(new Date(effectiveStartMs(C)).toISOString()).toBe("2026-11-25T09:00:00.000Z");
    const future = { startsOn: "2026-12-01", endsOn: "2026-12-20", createdAt: "2026-11-25T09:00:00Z" };
    expect(new Date(effectiveStartMs(future)).toISOString()).toBe("2026-11-30T23:00:00.000Z"); // 00:00 CET
    expect(new Date(effectiveStartMs({ startsOn: "2026-07-01", endsOn: "2026-07-30" })).toISOString()).toBe("2026-06-30T22:00:00.000Z"); // CEST
  });

  test("workouts: tréning pred vytvorením (aj v ten istý deň) sa nepočíta", () => {
    const d = data({
      logs: [
        { performedOn: "2026-11-20", completedAt: "2026-11-20T10:00:00Z" },
        { performedOn: TODAY, completedAt: before },
        { performedOn: TODAY, completedAt: after },
        { performedOn: TODAY, completedAt: null }, // bez času: deň začiatku sa nepočíta
        { performedOn: "2026-11-26", completedAt: null }, // neskorší deň bez času áno, ale je po dnešku
      ],
    });
    expect(challengeValue("workouts", C, d, TODAY)).toBe(1);
    expect(challengeValue("workouts", C, d, "2026-11-26")).toBe(2);
  });

  test("volume_kg: objem pred vytvorením sa nezarátava", () => {
    const d = data({
      logs: [
        { performedOn: "2026-11-24", completedAt: "2026-11-24T17:00:00Z", entries: sets([100, 15]) },
        { performedOn: TODAY, completedAt: before, entries: sets([100, 10]) },
        { performedOn: TODAY, completedAt: after, entries: sets([50, 4]) },
      ],
    });
    expect(challengeValue("volume_kg", C, d, TODAY)).toBe(200);
    expect(challengeProgress({ ...C, metric: "volume_kg", target: 1500 }, d, TODAY).done).toBe(false);
  });

  test("food_days: deň sa počíta, len ak má zápis vytvorený po vytvorení výzvy", () => {
    const d = data({
      foodDates: [
        { day: "2026-11-24", at: "2026-11-24T18:00:00Z" },
        { day: TODAY, at: before }, // zápis pred vytvorením
        "2026-11-25", // holý dátum = začiatok dňa → pred vytvorením
      ],
    });
    expect(challengeValue("food_days", C, d, TODAY)).toBe(0);
    expect(challengeValue("food_days", C, data({ foodDates: [{ day: TODAY, at: after }] }), TODAY)).toBe(1);
    // spätne zapísané jedlo z minulého dňa sa nepočíta, aj keď zápis vznikol po vytvorení
    expect(challengeValue("food_days", C, data({ foodDates: [{ day: "2026-11-24", at: after }] }), TODAY)).toBe(0);
  });

  test("prs: rekord pred vytvorením sa nepočíta", () => {
    const d = data({ prDates: ["2026-11-25", "2026-11-20", before, after] });
    expect(challengeValue("prs", C, d, TODAY)).toBe(1);
  });

  test("budúci začiatok: počíta od začiatku dňa začiatku", () => {
    const F = { startsOn: "2026-12-01", endsOn: "2026-12-20", createdAt: "2026-11-25T09:00:00Z" };
    const d = data({
      logs: [
        { performedOn: "2026-11-30", completedAt: "2026-11-30T22:30:00Z" }, // 23:30 CET, deň pred
        { performedOn: "2026-12-01", completedAt: "2026-11-30T23:30:00Z" }, // 00:30 CET
        { performedOn: "2026-12-01", completedAt: null }, // bez času = začiatok dňa → počíta
      ],
    });
    expect(challengeValue("workouts", F, d, "2026-12-05")).toBe(2);
  });

  test("streak_weeks: prvý týždeň len z dní po vytvorení", () => {
    // vytvorené v stredu 25.11. (týždeň od 23.11.); pondelok a utorok pred vytvorením sa nepočítajú
    const mk = (day: string, at: string) => ({ performedOn: day, completedAt: at });
    const early = [mk("2026-11-23", "2026-11-23T10:00:00Z"), mk("2026-11-24", "2026-11-24T10:00:00Z")];
    const d1 = data({ logs: [...early, mk("2026-11-25", after)] });
    expect(challengeValue("streak_weeks", C, d1, "2026-11-29")).toBe(0); // po vytvorení len 1 deň
    const d2 = data({ logs: [...early, mk("2026-11-25", after), mk("2026-11-27", "2026-11-27T10:00:00Z")] });
    expect(challengeValue("streak_weeks", C, d2, "2026-11-29")).toBe(1);
    // ďalší týždeň 30.11.–6.12. sa pripočíta
    const d3 = data({ logs: [...d2.logs, mk("2026-12-01", "2026-12-01T10:00:00Z"), mk("2026-12-03", "2026-12-03T10:00:00Z")] });
    expect(challengeValue("streak_weeks", C, d3, "2026-12-06")).toBe(2);
  });
});

// ---------------------------------------------------------------- výzvy: validácia vstupu
test.describe("validateChallenge", () => {
  const ok = { name: "Osmička", description: "", metric: "workouts" as const, target: 8, startsOn: TODAY, endsOn: "2026-12-20" };

  test("platná výzva prejde", () => {
    expect(validateChallenge(ok, TODAY)).toBeNull();
  });

  test("odmieta zlé názvy, typy, dátumy a ciele", () => {
    expect(validateChallenge({ ...ok, name: "  " }, TODAY)).toBe("name");
    expect(validateChallenge({ ...ok, name: "x".repeat(81) }, TODAY)).toBe("name");
    expect(validateChallenge({ ...ok, description: "x".repeat(301) }, TODAY)).toBe("description");
    expect(validateChallenge({ ...ok, metric: "weight_loss" as never }, TODAY)).toBe("metric");
    expect(validateChallenge({ ...ok, endsOn: "2026-11-20" }, TODAY)).toBe("dates");
    expect(validateChallenge({ ...ok, startsOn: "2026-11-01", endsOn: "2026-12-01" }, TODAY)).toBe("startPast");
    // začiatok v minulosti už nie je povolený ani o deň (výzva sa počíta od vytvorenia)
    expect(validateChallenge({ ...ok, startsOn: "2026-11-24" }, TODAY)).toBe("startPast");
    expect(validateChallenge({ ...ok, startsOn: "2026-11-26" }, TODAY)).toBeNull();
    expect(validateChallenge({ ...ok, startsOn: "2026-11-20", endsOn: "2026-11-24" }, TODAY)).toBe("startPast");
    expect(validateChallenge({ ...ok, endsOn: "2027-06-01" }, TODAY)).toBe("tooLong");
    expect(validateChallenge({ ...ok, target: 0 }, TODAY)).toBe("target");
    expect(validateChallenge({ ...ok, target: 2.5 }, TODAY)).toBe("target");
    expect(validateChallenge({ ...ok, target: Number.NaN }, TODAY)).toBe("target");
    expect(validateChallenge({ ...ok, startsOn: "nie-datum" }, TODAY)).toBe("dates");
  });

  test("rozsahy cieľa podľa typu a obdobia", () => {
    // 26 dní → tréningov najviac 26, dní s jedlom najviac 26
    expect(windowDays(TODAY, "2026-12-20")).toBe(26);
    expect(targetBounds("workouts", TODAY, "2026-12-20")).toEqual({ min: 1, max: 26 });
    expect(targetBounds("food_days", TODAY, "2026-12-20").max).toBe(26);
    expect(validateChallenge({ ...ok, target: 27 }, TODAY)).toBe("target");
    // séria týždňov: najviac počet týždňov obdobia (4), minimum 2
    expect(windowWeeks("2026-11-02", "2026-11-29")).toBe(4);
    expect(targetBounds("streak_weeks", "2026-11-02", "2026-11-29")).toEqual({ min: 2, max: 4 });
    expect(targetBounds("volume_kg", TODAY, "2026-12-20")).toEqual({ min: 100, max: 1_000_000 });
    expect(targetBounds("prs", TODAY, "2026-12-20").max).toBe(50);
  });
});

// ---------------------------------------------------------------- rebríček
test.describe("rebríček", () => {
  const c = (id: string, fullName: string, over: Partial<BoardClient> = {}): BoardClient => ({
    clientId: id,
    fullName,
    visible: true,
    workoutsWeek: 0,
    workoutsMonth: 0,
    streakWeeks: 0,
    prsMonth: 0,
    ...over,
  });

  test("maskovanie mena: krstné meno + iniciála, nič iné", () => {
    expect(maskName("Jana Nováková")).toBe("Jana N.");
    expect(maskName("  jana   ďuríková  ")).toBe("jana Ď.");
    expect(maskName("Peter")).toBe("Peter");
    expect(maskName("Anna Maria Kováčová")).toBe("Anna K.");
    expect(maskName("")).toBeNull();
    expect(maskName(null)).toBeNull();
    expect(maskName("Jana-Mária Nováková")).toBe("Jana-Mária N.");
    expect(maskName("1234 !!!")).toBeNull();
  });

  test("poradie podľa metriky, súťažné miesta pri zhode, nuly mimo poradia", () => {
    const clients = [
      c("a", "Adam Biely", { workoutsWeek: 3 }),
      c("b", "Beata Čierna", { workoutsWeek: 5 }),
      c("c", "Cyril Dubový", { workoutsWeek: 3 }),
      c("d", "Dana Eliášová", { workoutsWeek: 0 }),
    ];
    const board = buildLeaderboard(clients, "workoutsWeek", "a");
    expect(board.top.map((r) => [r.rank, r.name, r.value])).toEqual([
      [1, "Beata Č.", 5],
      [2, "Adam B.", 3],
      [2, "Cyril D.", 3],
    ]);
    expect(board.me).toEqual({ rank: 2, value: 3 });
    expect(board.total).toBe(3);
    // nula nemá miesto
    expect(buildLeaderboard(clients, "workoutsWeek", "d").me).toBeNull();
  });

  test("skrytý klient (opt-out) nie je v poradí a neposúva ostatných", () => {
    const clients = [
      c("a", "Adam Biely", { workoutsMonth: 4 }),
      c("b", "Beata Čierna", { workoutsMonth: 9, visible: false }),
      c("c", "Cyril Dubový", { workoutsMonth: 2 }),
    ];
    const board = buildLeaderboard(clients, "workoutsMonth", "a");
    expect(board.top.map((r) => r.name)).toEqual(["Adam B.", "Cyril D."]);
    expect(board.me).toEqual({ rank: 1, value: 4 });
    expect(board.total).toBe(2);
    // skrytý klient sám sa v poradí nenájde
    expect(buildLeaderboard(clients, "workoutsMonth", "b").me).toBeNull();
  });

  test("výstup nenesie id ani celé meno; top je ohraničený a volajúci mimo top má svoje miesto", () => {
    const many = Array.from({ length: 15 }, (_, i) => c(`id-${i}`, `Klient${i} Priezvisko${i}`, { prsMonth: 20 - i }));
    const board = buildLeaderboard(many, "prsMonth", "id-14");
    expect(board.top).toHaveLength(LEADERBOARD_TOP_N);
    expect(board.me).toEqual({ rank: 15, value: 6 });
    const json = JSON.stringify(board);
    expect(json).not.toContain("id-");
    expect(json).not.toContain("Priezvisko");
    for (const row of board.top) expect(Object.keys(row).sort()).toEqual(["isMe", "name", "rank", "value"]);
  });

  test("séria týždňov z týždenných počtov (aktuálny + minulý týždeň)", () => {
    const weeks = new Map([
      ["2026-11-23", 2],
      ["2026-11-16", 3],
      ["2026-11-09", 2],
      ["2026-11-02", 1], // 1. vynechanie sa toleruje, ďalšie nie
    ]);
    expect(streakFromWeeks(weeks, TODAY)).toBe(3);
    expect(streakFromWeeks(new Map(), TODAY)).toBe(0);
  });
});

// ---------------------------------------------------------------- týždenný súhrn
test.describe("týždenný súhrn", () => {
  test("ktorý týždeň sa sumarizuje: v nedeľu aktuálny, inak predchádzajúci", () => {
    expect(summaryWeekFor("2026-11-29")).toBe("2026-11-23"); // nedeľa
    expect(summaryWeekFor("2026-11-30")).toBe("2026-11-23"); // pondelok
    expect(summaryWeekFor("2026-12-02")).toBe("2026-11-23"); // streda
  });

  test("okno zobrazenia a raz za týždeň", () => {
    expect(isSummaryDue("2026-11-29", null)).toBe(true); // nedeľa
    expect(isSummaryDue("2026-11-30", null)).toBe(true);
    expect(isSummaryDue("2026-12-02", null)).toBe(true); // streda ešte áno
    expect(isSummaryDue("2026-12-03", null)).toBe(false); // štvrtok už nie
    expect(isSummaryDue("2026-11-30", "2026-11-23")).toBe(false); // už videné
    expect(isSummaryDue("2026-11-30", "2026-11-16")).toBe(true); // videný starší týždeň
    expect(isSummaryDue("2026-11-27", "2026-11-23")).toBe(false); // piatok: týždeň ešte beží, sumarizuje sa 16.11. a ten už je za oknom
  });

  const base = {
    weekStart: "2026-11-23",
    foodDates: ["2026-11-23", "2026-11-24", "2026-11-24", "2026-11-30"],
    proteinDays: 2,
    proteinTarget: 140,
    workoutTarget: 3,
    prs: [
      { exerciseName: "Drep", weightKg: 100, reps: 5 },
      { exerciseName: "Bench", weightKg: 80, reps: 5 },
    ],
    badgeIds: ["workouts_10"],
    challengeNames: ["Osmička"],
    streakWeeks: 3,
  };

  test("tréningy voči cieľu, prstence a počty", () => {
    const s = buildWeeklySummary({
      ...base,
      logsWeek: [
        { performedOn: "2026-11-23", entries: sets([100, 5]) },
        { performedOn: "2026-11-23", entries: sets([50, 10]) }, // druhý tréning v ten istý deň = jeden deň
        { performedOn: "2026-11-25", entries: sets([100, 5]) },
      ],
      logsPrev: [{ performedOn: "2026-11-17", entries: sets([100, 5]) }],
    });
    expect(s.workouts).toEqual({ done: 2, target: 3, met: false });
    expect(s.weekEnd).toBe("2026-11-29");
    const food = s.rings.find((r) => r.id === "food")!;
    expect(food.value).toBe(2); // 30. 11. je mimo týždňa
    expect(s.rings.find((r) => r.id === "protein")!.value).toBe(2);
    expect(s.prs.count).toBe(2);
    expect(s.prs.top[0].exerciseName).toBe("Drep");
    expect(s.hasActivity).toBe(true);
  });

  test("objem proti predchádzajúcemu týždňu", () => {
    const up = buildWeeklySummary({
      ...base,
      logsWeek: [{ performedOn: "2026-11-23", entries: sets([100, 12]) }], // 1200
      logsPrev: [{ performedOn: "2026-11-17", entries: sets([100, 10]) }], // 1000
    });
    expect(up.volume).toEqual({ thisKg: 1200, prevKg: 1000, deltaPct: 20, trend: "up" });
    const down = buildWeeklySummary({
      ...base,
      logsWeek: [{ performedOn: "2026-11-23", entries: sets([100, 5]) }],
      logsPrev: [{ performedOn: "2026-11-17", entries: sets([100, 10]) }],
    });
    expect(down.volume.trend).toBe("down");
    expect(down.volume.deltaPct).toBe(-50);
    const none = buildWeeklySummary({ ...base, logsWeek: [{ performedOn: "2026-11-23", entries: sets([100, 5]) }], logsPrev: [] });
    expect(none.volume).toMatchObject({ prevKg: 0, deltaPct: null, trend: "none" });
  });

  test("cieľ splnený a týždeň bez aktivity nemá súhrn", () => {
    const met = buildWeeklySummary({
      ...base,
      workoutTarget: 2,
      logsWeek: [{ performedOn: "2026-11-23" }, { performedOn: "2026-11-24" }],
      logsPrev: [],
    });
    expect(met.workouts.met).toBe(true);
    const empty = buildWeeklySummary({
      ...base,
      foodDates: [],
      proteinDays: 0,
      prs: [],
      badgeIds: [],
      challengeNames: [],
      logsWeek: [],
      logsPrev: [],
    });
    expect(empty.hasActivity).toBe(false);
  });

  test("tím trénera: súčty a príznak aktivity", () => {
    const t = buildTeamWeek({ workouts: 12, activeClients: 5, prs: 3, badges: 4, challengesDone: 1 }, 8, 2);
    expect(t).toMatchObject({ workouts: 12, totalClients: 8, needAttention: 2, hasActivity: true });
    expect(buildTeamWeek({ workouts: 0, activeClients: 0, prs: 0, badges: 0, challengesDone: 0 }, 3, 0).hasActivity).toBe(false);
  });
});

// ---------------------------------------------------------------- zdieľacie karty
test.describe("zdieľacia karta: výber dát a značka", () => {
  const branded = {
    brandName: "Fit s Adamom",
    welcomeText: "",
    logoUrl: "https://x.supabase.co/storage/v1/object/public/branding/a/logo-b.webp",
    photoUrl: null,
    theme: deriveBrandTheme("#2f6fed"),
  };

  test("bez značky (Starter/Pro, nenastavená) = FitPilot", () => {
    expect(pickShareBrand(null)).toEqual(DEFAULT_SHARE_BRAND);
    expect(pickShareBrand(undefined).isDefault).toBe(true);
    expect(pickShareBrand(null).logoUrl).toBeNull();
  });

  test("značka trénera (Business): názov, logo, akcentová farba tmavej témy", () => {
    const b = pickShareBrand(branded);
    expect(b.isDefault).toBe(false);
    expect(b.name).toBe("Fit s Adamom");
    expect(b.logoUrl).toBe(branded.logoUrl);
    expect(b.accent).toBe(branded.theme!.dark.accent);
    expect(b.onAccent).toBe(branded.theme!.dark.on);
    // značka len s farbou: názov ostane FitPilot
    const onlyColor = pickShareBrand({ ...branded, brandName: "", logoUrl: null });
    expect(onlyColor.name).toBe("FitPilot");
    expect(onlyColor.isDefault).toBe(false);
  });

  test("len krstné meno na karte", () => {
    expect(firstNameOf("Jana Nováková")).toBe("Jana");
    expect(firstNameOf("  Peter  ")).toBe("Peter");
    expect(firstNameOf("")).toBe("");
    expect(firstNameOf(null)).toBe("");
    expect(firstNameOf("Jana<script> Novak")).toBe("Janascript");
  });

  test("výber karty z úspechu: rekord, odznak, výzva a neplatný riadok", () => {
    const brand = DEFAULT_SHARE_BRAND;
    const pr = pickAchievementCard({ kind: "pr", badgeId: null, exerciseName: "Drep", value: 100, reps: 5, achievedOn: "2026-11-20", meta: null }, "Jana", brand);
    expect(pr).toMatchObject({ kind: "pr", exerciseName: "Drep", weightKg: 100, reps: 5, firstName: "Jana", date: "2026-11-20" });
    const badge = pickAchievementCard({ kind: "badge", badgeId: "workouts_10", exerciseName: null, value: null, reps: null, achievedOn: "2026-11-20", meta: null }, "Jana", brand);
    expect(badge).toMatchObject({ kind: "badge", badgeId: "workouts_10" });
    const ch = pickAchievementCard(
      { kind: "challenge", badgeId: null, exerciseName: null, value: null, reps: null, achievedOn: "2026-11-20", meta: { challenge_name: "Osmička" } },
      "Jana",
      brand,
    );
    expect(ch).toMatchObject({ kind: "challenge", challengeName: "Osmička" });
    expect(pickAchievementCard({ kind: "pr", badgeId: null, exerciseName: null, value: null, reps: null, achievedOn: "2026-11-20", meta: null }, "J", brand)).toBeNull();
    expect(pickAchievementCard({ kind: "challenge", badgeId: null, exerciseName: null, value: null, reps: null, achievedOn: "2026-11-20", meta: { challenge_name: 5 } }, "J", brand)).toBeNull();
  });

  test("týždenná karta nesie len súhrnné čísla a značku", () => {
    const card = pickWeeklyCard({ weekStart: "2026-11-23", workouts: 3, target: 3, prs: 1, volumeKg: 4200, badges: 0, streakWeeks: 4 }, "2026-11-29", "Jana", pickShareBrand(branded));
    expect(card).toMatchObject({ kind: "weekly", date: "2026-11-29", firstName: "Jana" });
    expect(card.brand.isDefault).toBe(false);
    expect(challengeNameOf({ challenge_name: "x".repeat(200) })).toHaveLength(80);
    expect(challengeNameOf({})).toBeNull();
  });
});

// ---------------------------------------------------------------- tarifné brány
test.describe("brány podľa tarify", () => {
  const sub = (over: Partial<SubscriptionRow>): SubscriptionRow => ({
    trainer_id: "11111111-1111-4111-8111-111111111111",
    stripe_customer_id: null,
    stripe_subscription_id: null,
    tier: "pro",
    status: "active",
    trial_ends_at: null,
    current_period_end: null,
    cancel_at_period_end: false,
    past_due_since: null,
    comped: false,
    client_limit: null,
    scheduled_tier: null,
    scheduled_client_limit: null,
    scheduled_change_at: null,
    ...over,
  });

  test("príznaky challenges a leaderboard: všetky tarify áno, rozsah určujú limity", () => {
    for (const tier of ["starter", "pro", "business"] as const) {
      expect(PLANS[tier].features.challenges).toBe(true);
      expect(PLANS[tier].features.leaderboard).toBe(true);
    }
    // zoznamy v plans.ts sa zhodujú s tým, čo naozaj existuje
    expect([...ALL_CHALLENGE_TYPES]).toEqual([...CHALLENGE_METRICS]);
    expect([...ALL_LEADERBOARD_METRICS]).toEqual([...LEADERBOARD_METRICS]);
  });

  test("limity Starter: 1 aktívna výzva, workouts + food_days, len všetci klienti, rebríček len tento týždeň", () => {
    const l = gamificationLimits("starter");
    expect(l.maxActiveChallenges).toBe(1);
    expect([...l.challengeTypes]).toEqual(["workouts", "food_days"]);
    expect(l.challengeTargeting).toBe("all");
    expect([...allowedLeaderboardMetrics("starter")]).toEqual(["workoutsWeek"]);
    // bez prístupu a skúška (tarifa starter) = rovnako prísne
    expect(gamificationLimits(null)).toEqual(l);
    expect(computeBilling(sub({ tier: "starter", status: "app_trial", trial_ends_at: new Date(Date.now() + 5 * 864e5).toISOString() }), 2).accessTier).toBe("starter");
  });

  test("limity Pro a Business: bez obmedzenia rozsahu (20, všetky typy, výber klientov, 4 záložky)", () => {
    for (const tier of ["pro", "business"] as const) {
      const l = gamificationLimits(tier);
      expect(l.maxActiveChallenges).toBe(MAX_ACTIVE_CHALLENGES);
      expect([...l.challengeTypes]).toEqual([...CHALLENGE_METRICS]);
      expect(l.challengeTargeting).toBe("any");
      expect([...allowedLeaderboardMetrics(tier)]).toEqual([...LEADERBOARD_METRICS]);
    }
  });

  test("kontrola novej výzvy voči limitom: typ, cieľ, počet", () => {
    const s = gamificationLimits("starter");
    const p = gamificationLimits("pro");
    expect(checkChallengeAgainstLimits(s, { metric: "workouts", allClients: true, activeCount: 0 })).toBeNull();
    expect(checkChallengeAgainstLimits(s, { metric: "food_days", allClients: true, activeCount: 0 })).toBeNull();
    expect(checkChallengeAgainstLimits(s, { metric: "prs", allClients: true, activeCount: 0 })).toBe("type");
    expect(checkChallengeAgainstLimits(s, { metric: "volume_kg", allClients: true, activeCount: 0 })).toBe("type");
    expect(checkChallengeAgainstLimits(s, { metric: "streak_weeks", allClients: true, activeCount: 0 })).toBe("type");
    expect(checkChallengeAgainstLimits(s, { metric: "workouts", allClients: false, activeCount: 0 })).toBe("targeting");
    expect(checkChallengeAgainstLimits(s, { metric: "workouts", allClients: true, activeCount: 1 })).toBe("limit");
    expect(checkChallengeAgainstLimits(p, { metric: "volume_kg", allClients: false, activeCount: 19 })).toBeNull();
    expect(checkChallengeAgainstLimits(p, { metric: "volume_kg", allClients: false, activeCount: 20 })).toBe("limit");
    expect(checkChallengeAgainstLimits(p, { metric: "bogus", allClients: true, activeCount: 0 })).toBe("type");
  });

  test("downgrade Pro → Starter: existujúce výzvy ostávajú, nové až pod limitom", () => {
    const s = gamificationLimits("starter");
    // 5 bežiacich z Pro: nová sa nedá, kým počet neklesne pod 1 (t. j. na 0)
    for (const n of [5, 2, 1]) expect(checkChallengeAgainstLimits(s, { metric: "workouts", allClients: true, activeCount: n })).toBe("limit");
    expect(checkChallengeAgainstLimits(s, { metric: "workouts", allClients: true, activeCount: 0 })).toBeNull();
    // downgrade nič nemaže ani neukončuje: stránka len ukáže stav „nad limitom“ a akcie end/delete zostávajú
    const page = readFileSync("app/dashboard/vyzvy/page.tsx", "utf8");
    expect(page).toContain("activeCount > limits.maxActiveChallenges");
    expect(page).toContain("challenge-over-limit");
    expect(page).not.toContain("challenges-locked");
  });

  test("klientom sa funkcia ukáže podľa tarify trénera, nie podľa read-only", () => {
    expect(featureAvailableForClients(sub({ tier: "pro" }), "challenges")).toBe(true);
    expect(featureAvailableForClients(sub({ tier: "business" }), "leaderboard")).toBe(true);
    expect(featureAvailableForClients(sub({ tier: "starter" }), "challenges")).toBe(true);
    expect(featureAvailableForClients(sub({ tier: "starter" }), "leaderboard")).toBe(true);
    expect(featureAvailableForClients(null, "challenges")).toBe(false);
    expect(featureAvailableForClients(sub({ tier: "pro", status: "canceled" }), "challenges")).toBe(false);
  });

  test("tréner nad limitom klientov: zobrazenie ostáva, zápis zamyká server", () => {
    const over = computeBilling(sub({ tier: "pro", client_limit: 30 }), 35);
    expect(over.readOnly).toBe(true);
    expect(over.features.challenges).toBe(false); // trainerBlock({feature}) zápis odmietne
    expect(challengesUnlocked(over)).toBe(true); // UI ukáže existujúce výzvy len na čítanie
    expect(leaderboardUnlocked(over)).toBe(true);
    const starter = computeBilling(sub({ tier: "starter", client_limit: 10 }), 3);
    expect(challengesUnlocked(starter)).toBe(true); // Starter už výzvy má (s limitmi)
    expect(challengesUnlocked(computeBilling(null, 0))).toBe(false);
  });
});

// ---------------------------------------------------------------- zvonček trénera
test.describe("zvonček trénera: dokončené výzvy", () => {
  const done = [
    { id: "a1", clientId: "c1", clientName: "Jana N.", challengeName: "Osmička", key: challengeDismissKey("a1") },
    { id: "a2", clientId: "c2", clientName: "Peter K.", challengeName: "Osmička", key: challengeDismissKey("a2") },
  ];

  test("položka, počet na odznaku a skrytie", () => {
    const data = { unread: 0, late: [], digest: null, challengesDone: done };
    expect(attentionTotal(data)).toBe(2);
    const items = buildAttentionItems(data);
    const it = items.find((i) => i.id === "challenges")!;
    expect(it.links.map((l) => l.label)).toEqual(["Jana N.", "Peter K."]);
    expect(it.dismiss?.keys).toEqual(done.map((d) => d.key));
    const after = applyDismissals(data, new Set([done[0].key]));
    expect(after.challengesDone).toHaveLength(1);
  });

  test("kľúč skrytia výzvy je platný, cudzí tvar nie", () => {
    expect(isValidDismissKey(challengeDismissKey("0d3f2b7a-1111-4222-8333-444455556666"))).toBe(true);
    expect(isValidDismissKey("chal:<script>")).toBe(false);
  });
});

// ---------------------------------------------------------------- statické kontroly bezpečnosti
test.describe("bezpečnosť (statické kontroly zdrojov)", () => {
  const sql = readFileSync("supabase/migrations/0079_gamification_b.sql", "utf8");

  test("RLS na všetkých nových tabuľkách, žiadny zápis pre anon/authenticated", () => {
    for (const table of ["challenges", "challenge_participants", "trainer_gamification_settings", "gamification_settings"]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`revoke all on public.${table} from anon, authenticated`);
      expect(sql).toContain(`grant select on public.${table} to authenticated`);
    }
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)[^;]*to\s+(authenticated|anon)/i);
    expect(sql).not.toMatch(/create policy[^;]*for (insert|update|delete|all)/i);
  });

  test("rebríčkové agregáty len pre service role, SECURITY DEFINER s fixným search_path", () => {
    expect(sql).toContain("revoke execute on function public.gamification_group_weeks(uuid, date) from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.gamification_group_weeks(uuid, date) to service_role");
    expect(sql).toContain("revoke execute on function public.gamification_group_period(uuid, date, date, date) from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.gamification_group_period(uuid, date, date, date) to service_role");
    // každá security definer funkcia nastavuje search_path
    const defs = sql.split("create or replace function").slice(1);
    for (const d of defs) {
      if (/security definer/.test(d)) expect(d).toMatch(/set search_path = public/);
    }
    // anon nikdy nemá EXECUTE na invoker funkcie
    expect(sql).toContain("revoke execute on function public.team_week_summary(date, date) from public, anon");
    expect(sql).toContain("revoke execute on function public.challenge_food_days(uuid[], date, date) from public, anon");
  });

  test("odznak za výzvu je idempotentný a limit aktívnych výziev drží trigger", () => {
    expect(sql).toContain("client_achievements_challenge_unique");
    expect(sql).toMatch(/kind in \('pr', 'badge', 'challenge'\)/);
    expect(sql).toContain("challenges_limit_guard");
    expect(sql).toContain(">= 20");
    expect(sql).toContain("challenge_participants_same_trainer");
  });

  test("klient čita len svoje výzvy (politiky bez rekurzie)", () => {
    const part = sql.slice(sql.indexOf('create policy "challenge_participants_select_own_client"'));
    expect(part).toContain("c.user_id = auth.uid()");
    expect(sql).toContain("c.trainer_id = auth.uid()");
  });

  test("zdieľacia karta: no-store, session, overenie vlastníctva a len krstné meno", () => {
    const route = readFileSync("app/api/gamification/share/route.tsx", "utf8");
    expect(route).toContain("no-store");
    expect(route).toContain("getUser()");
    expect(route).toContain("owner.user_id !== user.id");
    expect(route).toContain("owner.trainer_id !== user.id");
    expect(route).toContain("firstNameOf(");
    expect(route).toContain("firstNameOf(owner.full_name)");
    expect(route).toContain("firstNameOf(client.full_name)");
    expect(route).toContain("loadBrandingForTrainer");
  });

  test("trénerské akcie: stráž predplatného s funkciou a zápis cez service role", () => {
    const actions = readFileSync("app/dashboard/vyzvy/actions.ts", "utf8");
    expect(actions).toContain('trainerBlock({ feature: "challenges" })');
    // v2: nastavenie „rebríček zap/vyp“ na úrovni trénera sa zrušilo (rebríček je celoappkový)
    expect(actions).not.toContain("setLeaderboardEnabledAction");
    expect(actions.match(/trainerBlock\(/g)!.length).toBeGreaterThanOrEqual(3);
    expect(actions).toContain("tryCreateAdminClient()");
    // cieľoví klienti sa overujú proti vlastným klientom trénera
    expect(actions).toContain('.eq("trainer_id", auth.userId)');
    expect(actions).toContain("own.has(");
    // limity tarify (typ, cieľ, počet aktívnych) sa overujú na serveri
    expect(actions).toContain("gamificationLimits(state.accessTier)");
    expect(actions).toContain("checkChallengeAgainstLimits(limits");
  });

  test("rebríček (v2, celoappkový): poradie počíta DB, záložky podľa tarify trénera, skrytý klient rebríček nevidí", () => {
    const lb = readFileSync("lib/gamification/leaderboardServer.ts", "utf8");
    expect(lb).toContain("gamification_global_leaderboard");
    expect(lb).toContain("allowedLeaderboardMetrics(");
    expect(lb).toContain("leaderboard_visible");
    // nastavenie trénera sa už nečíta
    expect(lb).not.toContain("leaderboard_enabled");
    expect(lb).not.toContain("trainer_gamification_settings");
  });
});

// ---------------------------------------------------------------- preklady
test.describe("preklady SK + CS", () => {
  function keys(o: unknown, prefix = ""): string[] {
    if (!o || typeof o !== "object") return [prefix];
    return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
  }
  test("rovnaké kľúče v oboch jazykoch a nové sekcie existujú", () => {
    expect(keys(csMessages).sort()).toEqual(keys(skMessages).sort());
    for (const section of ["challenges", "leaderboard", "weekly", "share", "team"]) {
      expect(Object.keys(skMessages)).toContain(section);
    }
  });
});
