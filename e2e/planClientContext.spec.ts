import { test, expect } from "@playwright/test";
import {
  defaultFocusForSex,
  planClientContextLines,
  TRAINER_NOTE_PROMPT_MAX,
  type PlanClientFacts,
} from "../lib/ai/planClientContext";

/** Údaje klienta pre AI generátor plánu (lib/ai/planClientContext.ts) — čisté funkcie, bez servera. */

const EMPTY: PlanClientFacts = {
  goal: null,
  sex: null,
  age: null,
  weightKg: null,
  heightCm: null,
  activityLevel: null,
  nutritionGoal: null,
  trainerNote: null,
};

test.describe("planClientContext", () => {
  test("bez údajov → žiadne riadky", () => {
    expect(planClientContextLines(EMPTY)).toEqual([]);
  });

  test("všetky údaje → riadky do promptu", () => {
    const lines = planClientContextLines({
      goal: "  schudnúť\n10 kg  ",
      sex: "zena",
      age: 34,
      weightKg: 72,
      heightCm: 168,
      activityLevel: "lahka",
      nutritionGoal: "chudnutie",
      trainerNote: "Bolí ju ľavé koleno — žiadne výpady.",
    });
    expect(lines).toEqual([
      "- Cieľ z karty klienta: schudnúť 10 kg",
      "- Klient: žena, 34 rokov, 72 kg, 168 cm",
      "- Bežná aktivita: Ľahká aktivita (1–3× týždenne)",
      "- Cieľ stravy: Chudnutie",
      "- Poznámka trénera (obmedzenia, zranenia, preferencie): Bolí ju ľavé koleno — žiadne výpady.",
    ]);
  });

  test("dlhá poznámka trénera sa skráti", () => {
    const [line] = planClientContextLines({ ...EMPTY, trainerNote: "x".repeat(TRAINER_NOTE_PROMPT_MAX + 50) });
    expect(line.endsWith("…")).toBe(true);
    expect(line.length).toBeLessThan(TRAINER_NOTE_PROMPT_MAX + 80);
  });

  test("zameranie podľa pohlavia", () => {
    expect(defaultFocusForSex("zena")).toBe("dolna");
    expect(defaultFocusForSex("muz")).toBe("horna");
    expect(defaultFocusForSex(null)).toBe("vyvazene");
  });
});
