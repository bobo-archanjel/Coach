import { test, expect } from "@playwright/test";
import {
  DAY_CATEGORIES,
  DAY_CATEGORY_MUSCLE_GROUPS,
  DAY_CATEGORY_LABEL_SK,
  WHOLE_PLAN_FOCUSES,
  SINGLE_DAY_FOCUSES,
  PLAN_FOCUSES,
  candidatesForCategory,
  isSingleDayFocus,
  type PlanFocus,
} from "../lib/ai/planCategories";

/**
 * Čisté funkcie kategórií tréningových dní — RÝCHLE jednodňové generovanie
 * podľa partie (feature/ai-plan-partie, 2026-09-18). Nahrádza pôvodný
 * automatický "split builder" (`buildSplit`, feature/ai-plan-kategorie) —
 * appka už nerozhoduje ZA trénera, ktorý deň v týždni bude push/pull/legs.
 * Mapovanie kategória → muscle_group (znovupoužité z tej vetvy) a filter
 * kandidátov ostávajú — teraz slúžia len na 1-dňové partiové generovanie.
 */

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
        "zadok",
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

  test("SK názvy kategórií existujú pre každú z 10 partií", () => {
    for (const cat of DAY_CATEGORIES) {
      expect(DAY_CATEGORY_LABEL_SK[cat]).toBeTruthy();
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

test.describe("jeden plochý select \"Zameranie\" — 13 hodnôt, dve odlišné správania", () => {
  test("PLAN_FOCUSES = 3 celoplánové + 10 partiových, žiadne duplicity", () => {
    expect(PLAN_FOCUSES.length).toBe(13);
    expect(new Set(PLAN_FOCUSES).size).toBe(13);
    expect(WHOLE_PLAN_FOCUSES.length).toBe(3);
    expect(SINGLE_DAY_FOCUSES.length).toBe(10);
  });

  test("celoplánové hodnoty (vyvazene/horna/dolna) nie sú partiové", () => {
    for (const focus of WHOLE_PLAN_FOCUSES) {
      expect(isSingleDayFocus(focus)).toBe(false);
    }
  });

  test("všetkých 10 kategórií dňa JE partiové (jednodňové) zameranie", () => {
    for (const cat of DAY_CATEGORIES) {
      expect(isSingleDayFocus(cat)).toBe(true);
    }
  });

  test("SINGLE_DAY_FOCUSES je presne DAY_CATEGORIES (rovnaký zdroj hodnôt)", () => {
    expect([...SINGLE_DAY_FOCUSES].sort()).toEqual([...DAY_CATEGORIES].sort());
  });

  test("neznáma hodnota nie je partiové zameranie", () => {
    expect(isSingleDayFocus("neexistuje" as PlanFocus)).toBe(false);
  });
});
