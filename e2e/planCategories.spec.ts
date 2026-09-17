import { test, expect } from "@playwright/test";
import {
  DAY_CATEGORIES,
  DAY_CATEGORY_MUSCLE_GROUPS,
  DAY_CATEGORY_LABEL_SK,
  GLUTES_MUSCLE_GROUP,
  candidatesForCategory,
  buildSplit,
  type DayCategory,
} from "../lib/ai/planCategories";
import type { PlanGoal } from "../lib/ai/planGenerator";

/**
 * Čisté funkcie kategórií tréningových dní (feature/ai-plan-kategorie) — bez
 * volania modelu/DB. Nahrádza pôvodný voľný pomer horná/dolná časť tela
 * (feature/ai-plan-zameranie, `e2e/planTaxonomy.spec.ts`) deterministickým
 * rozdelením na dni: `buildSplit` (appka rozhodne o štruktúre týždňa) a
 * mapovanie kategória → muscle_group (appka podľa neho filtruje kandidátov
 * pre daný deň).
 */

const GOALS: PlanGoal[] = ["chudnutie", "hypertrofia", "sila", "kondicia"];

test.describe("mapovanie kategória → muscle_group", () => {
  test("jednotlivé partie sedia presne s reťazcami z MUSCLE_SK (scripts/import-exercises.mjs)", () => {
    expect(DAY_CATEGORY_MUSCLE_GROUPS.chest).toEqual(["hrudník"]);
    expect(DAY_CATEGORY_MUSCLE_GROUPS.shoulders).toEqual(["ramená"]);
    expect(DAY_CATEGORY_MUSCLE_GROUPS.arms).toEqual(["biceps", "triceps", "predlaktia"]);
    expect(DAY_CATEGORY_MUSCLE_GROUPS.back).toEqual(["chrbát (širák)", "spodný chrbát", "stredný chrbát", "trapézy"]);
  });

  test("push = hrudník + ramená + triceps (nie biceps)", () => {
    expect(DAY_CATEGORY_MUSCLE_GROUPS.push).toEqual(expect.arrayContaining(["hrudník", "ramená", "triceps"]));
    expect(DAY_CATEGORY_MUSCLE_GROUPS.push).not.toContain("biceps");
  });

  test("pull = chrbát/trapézy + biceps (nie triceps)", () => {
    expect(DAY_CATEGORY_MUSCLE_GROUPS.pull).toEqual(
      expect.arrayContaining(["chrbát (širák)", "spodný chrbát", "stredný chrbát", "trapézy", "biceps"]),
    );
    expect(DAY_CATEGORY_MUSCLE_GROUPS.pull).not.toContain("triceps");
  });

  test("upper = zjednotenie chest + back + shoulders + arms", () => {
    for (const mg of [
      "hrudník",
      "chrbát (širák)",
      "spodný chrbát",
      "stredný chrbát",
      "trapézy",
      "ramená",
      "biceps",
      "triceps",
      "predlaktia",
    ]) {
      expect(DAY_CATEGORY_MUSCLE_GROUPS.upper).toContain(mg);
    }
    expect(DAY_CATEGORY_MUSCLE_GROUPS.upper).not.toContain("zadok");
  });

  test("legs a lower sú rovnaké a obsahujú zadok aj doplnkovo brucho (core)", () => {
    expect(DAY_CATEGORY_MUSCLE_GROUPS.legs).toEqual(DAY_CATEGORY_MUSCLE_GROUPS.lower);
    expect(DAY_CATEGORY_MUSCLE_GROUPS.legs).toEqual(
      expect.arrayContaining([
        "stehná (kvadriceps)",
        "zadné stehná",
        GLUTES_MUSCLE_GROUP,
        "lýtka",
        "abduktory (vonkajšie stehná)",
        "adduktory (vnútorné stehná)",
        "brucho",
      ]),
    );
  });

  test("fullbody má zástupcu z každej hlavnej skupiny + core, core nie je vlastná kategória", () => {
    const fb = DAY_CATEGORY_MUSCLE_GROUPS.fullbody;
    expect(fb).toEqual(expect.arrayContaining(["hrudník", "chrbát (širák)", "ramená", "stehná (kvadriceps)", "zadok", "brucho"]));
    expect(DAY_CATEGORIES).not.toContain("core");
  });

  test("každá kategória má neprázdny zoznam partií a všetky reťazce sú unikátne v rámci kategórie", () => {
    for (const cat of DAY_CATEGORIES) {
      const groups = DAY_CATEGORY_MUSCLE_GROUPS[cat];
      expect(groups.length).toBeGreaterThan(0);
      expect(new Set(groups).size).toBe(groups.length);
    }
  });
});

interface FakeCandidate {
  id: string;
  muscleGroup: string;
}

const FIXTURE_CANDIDATES: FakeCandidate[] = [
  { id: "c1", muscleGroup: "hrudník" },
  { id: "c2", muscleGroup: "hrudník" },
  { id: "b1", muscleGroup: "chrbát (širák)" },
  { id: "b2", muscleGroup: "trapézy" },
  { id: "s1", muscleGroup: "ramená" },
  { id: "bi1", muscleGroup: "biceps" },
  { id: "tr1", muscleGroup: "triceps" },
  { id: "q1", muscleGroup: "stehná (kvadriceps)" },
  { id: "g1", muscleGroup: "zadok" },
  { id: "g2", muscleGroup: "zadok" },
  { id: "ab1", muscleGroup: "brucho" },
  { id: "neck1", muscleGroup: "krk" },
];

test.describe("filter kandidátov podľa kategórie (candidatesForCategory)", () => {
  test("chest vráti len hrudník kandidátov", () => {
    const result = candidatesForCategory(FIXTURE_CANDIDATES, "chest");
    expect(result.map((c) => c.id).sort()).toEqual(["c1", "c2"]);
  });

  test("legs vráti nohy + zadok + core (brucho), nie hornú časť", () => {
    const result = candidatesForCategory(FIXTURE_CANDIDATES, "legs").map((c) => c.id).sort();
    expect(result).toEqual(["ab1", "g1", "g2", "q1"]);
  });

  test("push vráti hrudník + ramená + triceps, nie biceps ani chrbát", () => {
    const result = candidatesForCategory(FIXTURE_CANDIDATES, "push").map((c) => c.id).sort();
    expect(result).toEqual(["c1", "c2", "s1", "tr1"]);
  });

  test("pull vráti chrbát/trapézy + biceps, nie hrudník ani triceps", () => {
    const result = candidatesForCategory(FIXTURE_CANDIDATES, "pull").map((c) => c.id).sort();
    expect(result).toEqual(["b1", "b2", "bi1"]);
  });

  test("krk (neck) nepatrí do žiadnej kategórie dňa", () => {
    for (const cat of DAY_CATEGORIES) {
      expect(candidatesForCategory(FIXTURE_CANDIDATES, cat).some((c) => c.id === "neck1")).toBe(false);
    }
  });

  test("fullbody pokrýva zástupcov z chest/back/legs/shoulders + core, nie samostatne arms", () => {
    const ids = candidatesForCategory(FIXTURE_CANDIDATES, "fullbody").map((c) => c.id).sort();
    expect(ids).toEqual(["ab1", "b1", "b2", "c1", "c2", "g1", "g2", "q1", "s1"]);
  });
});

test.describe("buildSplit — deterministický split builder", () => {
  test("vracia neprázdny zoznam presnej dĺžky pre každý počet dní 1-7, naprieč cieľmi a zameraniami", () => {
    for (let days = 1; days <= 7; days++) {
      for (const goal of GOALS) {
        for (const focus of ["vyvazene", "horna", "dolna"] as const) {
          const split = buildSplit(days, goal, focus);
          expect(split.length).toBe(days);
          expect(split.length).toBeGreaterThan(0);
          for (const cat of split) expect(DAY_CATEGORIES).toContain(cat);
        }
      }
    }
  });

  test("1 deň je vždy fullbody bez ohľadu na zameranie (jediný tréning musí pokryť celé telo)", () => {
    for (const goal of GOALS) {
      expect(buildSplit(1, goal, "vyvazene")).toEqual(["fullbody"]);
      expect(buildSplit(1, goal, "dolna")).toEqual(["fullbody"]);
      expect(buildSplit(1, goal, "horna")).toEqual(["fullbody"]);
    }
  });

  test("goal mení tvar splitu od 5 dní vyššie (špecializácia push/pull/legs pri hypertrofii/sile)", () => {
    expect(buildSplit(5, "kondicia", "vyvazene")).toEqual(["upper", "lower", "fullbody", "upper", "lower"]);
    expect(buildSplit(5, "hypertrofia", "vyvazene")).toEqual(["push", "pull", "legs", "upper", "lower"]);
    // pod 5 dní je tvar rovnaký pre všetky ciele
    expect(buildSplit(3, "kondicia", "vyvazene")).toEqual(buildSplit(3, "sila", "vyvazene"));
  });

  test('"dolna" pridá/uprednostní legs/lower oproti "vyvazene" (aspoň jedna kategória sa zmení) — naprieč viacerými kombináciami', () => {
    const combos: [number, PlanGoal][] = [
      [2, "kondicia"],
      [3, "kondicia"],
      [4, "hypertrofia"],
      [5, "hypertrofia"],
      [5, "kondicia"],
      [6, "sila"],
      [6, "chudnutie"],
      [7, "hypertrofia"],
      [7, "kondicia"],
    ];
    for (const [days, goal] of combos) {
      const base = buildSplit(days, goal, "vyvazene");
      const dolna = buildSplit(days, goal, "dolna");
      expect(dolna).not.toEqual(base);
      const lowerCount = (arr: DayCategory[]) => arr.filter((c) => c === "legs" || c === "lower").length;
      expect(lowerCount(dolna)).toBeGreaterThan(lowerCount(base));
    }
  });

  test('"horna" pridá/uprednostní upper-orientované kategórie oproti "vyvazene" — naprieč viacerými kombináciami', () => {
    const combos: [number, PlanGoal][] = [
      [2, "kondicia"],
      [3, "kondicia"],
      [4, "hypertrofia"],
      [5, "hypertrofia"],
      [5, "kondicia"],
      [6, "sila"],
      [6, "chudnutie"],
      [7, "hypertrofia"],
      [7, "kondicia"],
    ];
    const UPPER_LEANING = new Set(["push", "pull", "upper", "chest", "back", "shoulders", "arms"]);
    for (const [days, goal] of combos) {
      const base = buildSplit(days, goal, "vyvazene");
      const horna = buildSplit(days, goal, "horna");
      expect(horna).not.toEqual(base);
      const upperCount = (arr: DayCategory[]) => arr.filter((c) => UPPER_LEANING.has(c)).length;
      expect(upperCount(horna)).toBeGreaterThan(upperCount(base));
    }
  });

  test('"dolna" a "horna" nikdy úplne nevyprázdnia opačnú polovicu tela (aspoň 1 deň zostane) pri viac než 1 dni', () => {
    const UPPER_LEANING = new Set(["push", "pull", "upper", "chest", "back", "shoulders", "arms"]);
    const LOWER_LEANING = new Set(["legs", "lower"]);
    for (let days = 2; days <= 7; days++) {
      for (const goal of GOALS) {
        const dolna = buildSplit(days, goal, "dolna");
        if (buildSplit(days, goal, "vyvazene").some((c) => UPPER_LEANING.has(c))) {
          expect(dolna.some((c) => UPPER_LEANING.has(c))).toBe(true);
        }
        const horna = buildSplit(days, goal, "horna");
        if (buildSplit(days, goal, "vyvazene").some((c) => LOWER_LEANING.has(c))) {
          expect(horna.some((c) => LOWER_LEANING.has(c))).toBe(true);
        }
      }
    }
  });

  test("presné hodnoty pre reprezentatívne kombinácie (regresný odtlačok)", () => {
    expect(buildSplit(3, "kondicia", "vyvazene")).toEqual(["upper", "lower", "fullbody"]);
    expect(buildSplit(3, "kondicia", "dolna")).toEqual(["upper", "lower", "legs"]);
    expect(buildSplit(3, "kondicia", "horna")).toEqual(["upper", "lower", "upper"]);

    expect(buildSplit(4, "kondicia", "vyvazene")).toEqual(["upper", "lower", "upper", "lower"]);
    expect(buildSplit(4, "kondicia", "dolna")).toEqual(["upper", "lower", "legs", "lower"]);
    expect(buildSplit(4, "kondicia", "horna")).toEqual(["upper", "lower", "upper", "upper"]);

    expect(buildSplit(5, "hypertrofia", "vyvazene")).toEqual(["push", "pull", "legs", "upper", "lower"]);
    expect(buildSplit(5, "hypertrofia", "dolna")).toEqual(["push", "pull", "legs", "legs", "lower"]);
    expect(buildSplit(5, "hypertrofia", "horna")).toEqual(["push", "pull", "legs", "upper", "upper"]);

    expect(buildSplit(6, "kondicia", "vyvazene")).toEqual(["upper", "lower", "fullbody", "upper", "lower", "fullbody"]);
    expect(buildSplit(6, "kondicia", "dolna")).toEqual(["upper", "lower", "legs", "upper", "lower", "legs"]);
    expect(buildSplit(6, "kondicia", "horna")).toEqual(["upper", "lower", "upper", "upper", "lower", "upper"]);

    expect(buildSplit(7, "hypertrofia", "vyvazene")).toEqual(["push", "pull", "legs", "upper", "lower", "fullbody", "fullbody"]);
    expect(buildSplit(7, "hypertrofia", "dolna")).toEqual(["push", "pull", "legs", "upper", "lower", "legs", "legs"]);
    expect(buildSplit(7, "hypertrofia", "horna")).toEqual(["push", "pull", "legs", "upper", "lower", "upper", "upper"]);
  });

  test("mimo rozsahu 1-7 sa dni orežú (obranné správanie, formulár aj tak validuje 1-7)", () => {
    expect(buildSplit(0, "kondicia", "vyvazene")).toEqual(["fullbody"]);
    expect(buildSplit(10, "kondicia", "vyvazene")).toEqual(buildSplit(7, "kondicia", "vyvazene"));
  });

  test("SK názvy dní existujú pre každú kategóriu", () => {
    for (const cat of DAY_CATEGORIES) {
      expect(DAY_CATEGORY_LABEL_SK[cat]).toBeTruthy();
    }
  });
});
