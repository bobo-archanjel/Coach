import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_MEAL_TARGET,
  XP_RINGS_DAY,
  allRingsClosed,
  canMarkRest,
  celebrationDue,
  computeDailyRings,
  distinctMealSlots,
  mealTargetFromPlan,
  ringsXp,
  summarizeTodayFood,
  type DailyRingInput,
} from "../lib/gamification/rings";
import { buildGamificationHome } from "../lib/gamification/stats";
import { computeXp, XP_FOOD_DAY, XP_WORKOUT } from "../lib/gamification/xp";

// Denné prstence (Strava, Bielkoviny, Pohyb): čistá matematika, oslava raz za deň, XP, odpočinok mimo tréningov.

const base: DailyRingInput = { mealSlots: 0, mealTarget: 3, proteinG: 0, proteinTarget: 140, workoutToday: false, restToday: false };
const ring = (rings: ReturnType<typeof computeDailyRings>, id: string) => rings.find((r) => r.id === id)!;

test.describe("denné prstence: matematika", () => {
  test("poradie Pohyb, Bielkoviny, Strava; bielkoviny sa bez cieľa skryjú", () => {
    expect(computeDailyRings(base).map((r) => r.id)).toEqual(["move", "protein", "meals"]);
    expect(computeDailyRings({ ...base, proteinTarget: null }).map((r) => r.id)).toEqual(["move", "meals"]);
    expect(computeDailyRings({ ...base, proteinTarget: 0 }).map((r) => r.id)).toEqual(["move", "meals"]);
  });

  test("Pohyb: viac tréningov za deň → 2/1, 3/1 (prstenec plný už pri prvom); oddych 1/1", () => {
    const two = ring(computeDailyRings({ ...base, workoutToday: true, workoutsToday: 2 }), "move");
    expect(two).toMatchObject({ value: 2, goal: 1, fraction: 1, done: true, via: "workout" });
    expect(ring(computeDailyRings({ ...base, workoutToday: true, workoutsToday: 3 }), "move").value).toBe(3);
    // bez počtu (starší volajúci) = 1
    expect(ring(computeDailyRings({ ...base, workoutToday: true }), "move").value).toBe(1);
    expect(ring(computeDailyRings({ ...base, restToday: true }), "move")).toMatchObject({ value: 1, done: true, via: "rest" });
    expect(ring(computeDailyRings({ ...base }), "move")).toMatchObject({ value: 0, done: false });
  });

  test("Strava: počet rôznych jedál voči cieľu, uzavretá pri >= cieľ, hodnota sa orezáva", () => {
    expect(ring(computeDailyRings({ ...base, mealSlots: 2 }), "meals")).toMatchObject({ value: 2, goal: 3, done: false });
    expect(ring(computeDailyRings({ ...base, mealSlots: 2 }), "meals").fraction).toBeCloseTo(2 / 3);
    expect(ring(computeDailyRings({ ...base, mealSlots: 3 }), "meals")).toMatchObject({ value: 3, goal: 3, fraction: 1, done: true });
    expect(ring(computeDailyRings({ ...base, mealSlots: 5 }), "meals")).toMatchObject({ value: 3, goal: 3, done: true });
  });

  test("cieľ jedál: bez jedálnička 3, inak z plánu, orezané na 1–6", () => {
    expect(ring(computeDailyRings({ ...base, mealTarget: undefined }), "meals").goal).toBe(DEFAULT_MEAL_TARGET);
    expect(ring(computeDailyRings({ ...base, mealTarget: null }), "meals").goal).toBe(3);
    expect(ring(computeDailyRings({ ...base, mealTarget: 5 }), "meals").goal).toBe(5);
    expect(ring(computeDailyRings({ ...base, mealTarget: 0 }), "meals").goal).toBe(1);
    expect(ring(computeDailyRings({ ...base, mealTarget: 12 }), "meals").goal).toBe(6);
  });

  test("mealTargetFromPlan: dolný medián neprázdnych dní, fallback 3", () => {
    expect(mealTargetFromPlan(undefined)).toBe(3);
    expect(mealTargetFromPlan(null)).toBe(3);
    expect(mealTargetFromPlan([])).toBe(3);
    expect(mealTargetFromPlan([0, 0])).toBe(3); // prázdne dni sa ignorujú
    expect(mealTargetFromPlan([5])).toBe(5);
    expect(mealTargetFromPlan([4, 4, 5])).toBe(4);
    expect(mealTargetFromPlan([3, 5])).toBe(3); // nesplniteľne husté dni cieľ nezvyšujú
    expect(mealTargetFromPlan([0, 4, 6])).toBe(4);
    expect(mealTargetFromPlan([9])).toBe(6);
  });

  test("distinctMealSlots a summarizeTodayFood: rôzne sloty, neznáme sa ignorujú, bielkoviny z gramáže", () => {
    expect(distinctMealSlots(null)).toBe(0);
    expect(distinctMealSlots([{ meal_slot: "obed" }, { meal_slot: "obed" }, { meal_slot: "vecera" }, { meal_slot: "x" }, {}])).toBe(2);
    const sum = summarizeTodayFood([
      { meal_slot: "ranajky", grams: 200, protein_100g: 10 },
      { meal_slot: "ranajky", grams: "100", protein_100g: "20" },
      { meal_slot: "obed", grams: 150, protein_100g: 20 },
    ]);
    expect(sum).toEqual({ mealSlots: 2, proteinG: 70 });
  });

  test("Bielkoviny: uzavreté od 90 % cieľa, pod nie; kruh je plný presne pri uzavretí", () => {
    expect(ring(computeDailyRings({ ...base, proteinG: 125.9 }), "protein").done).toBe(false);
    const met = ring(computeDailyRings({ ...base, proteinG: 126 }), "protein");
    expect(met).toMatchObject({ done: true, fraction: 1, value: 126, goal: 140 });
    expect(ring(computeDailyRings({ ...base, proteinG: 300 }), "protein")).toMatchObject({ done: true, fraction: 1 });
    expect(ring(computeDailyRings({ ...base, proteinG: 63 }), "protein").fraction).toBeCloseTo(0.5);
  });

  test("Pohyb: zatvára dokončený tréning ALEBO odpočinok, inak otvorený", () => {
    expect(ring(computeDailyRings(base), "move")).toMatchObject({ done: false, value: 0, via: null });
    expect(ring(computeDailyRings({ ...base, workoutToday: true }), "move")).toMatchObject({ done: true, value: 1, via: "workout" });
    expect(ring(computeDailyRings({ ...base, restToday: true }), "move")).toMatchObject({ done: true, value: 1, via: "rest" });
    // tréning má prednosť pred odpočinkom (odpočinok sa pri tréningu nezobrazuje)
    expect(ring(computeDailyRings({ ...base, workoutToday: true, restToday: true }), "move").via).toBe("workout");
  });

  test("odpočinok sa dá označiť len bez dnešného tréningu", () => {
    expect(canMarkRest(false)).toBe(true);
    expect(canMarkRest(true)).toBe(false);
  });
});

test.describe("denné prstence: uzavretie a oslava raz za deň", () => {
  const closed: DailyRingInput = { mealSlots: 3, mealTarget: 3, proteinG: 130, proteinTarget: 140, workoutToday: false, restToday: true };

  test("allRingsClosed: všetky viditeľné, aspoň jeden; skrytý prstenec neblokuje", () => {
    expect(allRingsClosed(computeDailyRings(base))).toBe(false);
    expect(allRingsClosed([])).toBe(false);
    expect(allRingsClosed(computeDailyRings(closed))).toBe(true);
    expect(allRingsClosed(computeDailyRings({ ...closed, proteinG: 0 }))).toBe(false);
    // bez cieľa bielkovín sa prstenec skryje a nič nebráni uzavretiu
    expect(allRingsClosed(computeDailyRings({ ...closed, proteinG: 0, proteinTarget: null }))).toBe(true);
    expect(allRingsClosed(computeDailyRings({ ...closed, mealSlots: 2 }))).toBe(false);
    expect(allRingsClosed(computeDailyRings({ ...closed, restToday: false }))).toBe(false);
  });

  test("celebrationDue: raz za deň, nový deň oslavu znova povolí", () => {
    const rings = computeDailyRings(closed);
    expect(celebrationDue(rings, null, "2026-11-25")).toBe(true);
    expect(celebrationDue(rings, "2026-11-24", "2026-11-25")).toBe(true);
    expect(celebrationDue(rings, "2026-11-25", "2026-11-25")).toBe(false);
    expect(celebrationDue(computeDailyRings(base), null, "2026-11-25")).toBe(false);
  });
});

test.describe("denné prstence: XP za uzavreté dni", () => {
  test("ringsXp je 10 za deň, deterministicky z počtu dní", () => {
    expect(XP_RINGS_DAY).toBe(10);
    expect(ringsXp(0)).toBe(0);
    expect(ringsXp(3)).toBe(30);
    expect(ringsXp(-2)).toBe(0);
    expect(ringsXp(2.9)).toBe(20);
  });

  test("computeXp pripočíta ringXp a bez neho sa nič nemení (migrácia 0087 nemusí bežať)", () => {
    const without = computeXp({ workouts: 2, foodDays: 3, prs: 0, badgeIds: [] });
    expect(without.rings).toBe(0);
    expect(without.total).toBe(2 * XP_WORKOUT + 3 * XP_FOOD_DAY);
    const withRings = computeXp({ workouts: 2, foodDays: 3, prs: 0, badgeIds: [], ringXp: ringsXp(4) });
    expect(withRings.rings).toBe(40);
    expect(withRings.total).toBe(without.total + 40);
    expect(computeXp({ workouts: 0, foodDays: 0, prs: 0, badgeIds: [], ringXp: -5 }).total).toBe(0);
  });
});

test.describe("denné prstence: karta Dnes a odpočinok mimo tréningov", () => {
  test("buildGamificationHome nesie denné prstence, týždenný riadok a stav odpočinku", () => {
    const rings = computeDailyRings({ ...base, mealSlots: 1, restToday: true });
    const home = buildGamificationHome(
      { workouts: 1, foodDays: 1, prCount: 0, badgeIds: [], ringXp: 20 },
      {
        planDays: 3,
        trainedDates: ["2026-11-23"],
        today: "2026-11-25",
        daily: { rings, restAvailable: true, restToday: true, workoutToday: false },
      },
    );
    expect(home.rings.map((r) => r.id)).toEqual(["move", "protein", "meals"]);
    expect(home.week).toEqual({ done: 1, target: 3 });
    expect(home.rest).toEqual({ available: true, active: true, workoutToday: false });
    expect(home.xp.rings).toBe(20);
    expect(home.xp.total).toBe(XP_WORKOUT + XP_FOOD_DAY + 20);
  });

  test("odpočinok nezvyšuje týždenný počet tréningov ani XP za tréningy", () => {
    const home = buildGamificationHome(
      { workouts: 0, foodDays: 0, prCount: 0, badgeIds: [] },
      {
        planDays: 2,
        trainedDates: [],
        today: "2026-11-25",
        daily: { rings: computeDailyRings({ ...base, restToday: true }), restAvailable: true, restToday: true, workoutToday: false },
      },
    );
    expect(home.week.done).toBe(0);
    expect(home.xp.workouts).toBe(0);
  });

  // Záruka „rest nie je tréning“: dopyt na tabuľku (.from) je povolený len v kóde prstencov. Odpočinok žije v samostatnej tabuľke client_rest_days a číta ho VÝLUČNE kód
  // denných prstencov. Séria, misie, odznaky, reporty a XP čítajú workout_logs — keby sa tabuľka dostala inam,
  // test zlyhá.
  test("client_rest_days sa nepoužíva v sériách, misiách, odznakoch, reportoch ani XP", () => {
    const allowed = new Set(["lib/gamification/ringsServer.ts", "app/portal/gamificationActions.ts"]);
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (name === "node_modules" || name.startsWith(".")) continue;
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(name)) {
          const rel = full.split("\\").join("/");
          if (readFileSync(full, "utf8").includes('from("client_rest_days")') && !allowed.has(rel)) hits.push(rel);
        }
      }
    };
    walk("lib");
    walk("app");
    expect(hits).toEqual([]);
  });

  test("migrácia 0087: obe tabuľky, jeden riadok na deň, RLS len čítanie, idempotentná", () => {
    const sql = readFileSync("supabase/migrations/0087_daily_rings.sql", "utf8");
    for (const t of ["client_rest_days", "client_ring_days"]) {
      expect(sql).toContain(`create table if not exists public.${t}`);
      expect(sql).toContain(`alter table public.${t} enable row level security`);
      expect(sql).toContain(`revoke all on public.${t} from anon, authenticated`);
    }
    expect(sql.match(/primary key \(client_id, day\)/g)).toHaveLength(2);
    expect(sql).not.toMatch(/for (insert|update|delete)/i);
  });

  test("texty SK aj CS pre denné prstence a oslavu", () => {
    const keys = [
      "ringsAria", "meals", "protein", "move", "value", "aria", "proteinValue", "proteinAria", "mealsHint", "proteinHint", "proteinDone",
      "moveWorkout", "moveRest", "moveOpen", "weekLine", "restButton", "restActive", "restUndo", "restWorkout", "restError", "celebrate",
      "celebrateXp", "celebrateClose",
    ];
    for (const lang of ["sk", "cs"]) {
      const m = JSON.parse(readFileSync(`messages/${lang}/gamification.json`, "utf8")) as { daily: Record<string, string>; xpBreakdown: Record<string, string> };
      for (const k of keys) expect(m.daily[k], `${lang} daily.${k}`).toBeTruthy();
      expect(m.xpBreakdown.rings, `${lang} xpBreakdown.rings`).toBeTruthy();
    }
    expect(JSON.parse(readFileSync("messages/sk/gamification.json", "utf8")).daily.celebrate).toBe("Všetky kruhy uzavreté");
  });
});
