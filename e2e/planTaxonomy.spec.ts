import { test, expect } from "@playwright/test";
import {
  equipmentLevel,
  clientEquipmentLevel,
  exerciseFitsEquipment,
  regionForMuscleGroup,
  analyzeFocus,
  focusTargetMet,
  GLUTES_MUSCLE_GROUP,
  FOCUS_MIN_GLUTES,
} from "../lib/ai/planTaxonomy";

/**
 * Čisté funkcie AI generátora plánu — vybavenie ako štrukturálny filter
 * (feature/ai-plan-zameranie) + celoplánové "Zameranie" (vyvážene/horná/dolná)
 * ako jednoduchý pomer cvikov naprieč celým plánom. Bez volania modelu/DB.
 *
 * Región/pomer logika bola dočasne nahradená automatickým split builderom
 * (feature/ai-plan-kategorie) — appka vtedy sama rozhodovala, ktorý deň bude
 * push/pull/legs, čo presne NEBOLO to, čo tréner chcel. 2026-09-18
 * (feature/ai-plan-partie) sa táto jednoduchá verzia vrátila. Partiové
 * (jednodňové) kategórie majú vlastnú sadu v `e2e/planCategories.spec.ts`.
 */

test.describe("equipment hierarchia", () => {
  test("mapovanie equipment → úroveň", () => {
    expect(equipmentLevel("body only")).toBe(0);
    expect(equipmentLevel("dumbbell")).toBe(1);
    expect(equipmentLevel("barbell")).toBe(1);
    expect(equipmentLevel("bands")).toBe(1);
    expect(equipmentLevel("machine")).toBe(2);
    expect(equipmentLevel("cable")).toBe(2);
    expect(equipmentLevel("other")).toBe(2);
    // neznáme / NULL → konzervatívne 2
    expect(equipmentLevel(null)).toBe(2);
    expect(equipmentLevel("teleport")).toBe(2);
    // case-insensitive
    expect(equipmentLevel("BODY ONLY")).toBe(0);
  });

  test("úroveň klienta podľa PlanEquipment", () => {
    expect(clientEquipmentLevel("len_telo")).toBe(0);
    expect(clientEquipmentLevel("domace_vybavenie")).toBe(1);
    expect(clientEquipmentLevel("plna_posilnovna")).toBe(2);
  });

  test("cvik sedí klientovi len ak nie je nad jeho úrovňou", () => {
    // "len telo" klient — len bodyweight
    expect(exerciseFitsEquipment("body only", "len_telo")).toBe(true);
    expect(exerciseFitsEquipment("dumbbell", "len_telo")).toBe(false);
    expect(exerciseFitsEquipment("machine", "len_telo")).toBe(false);
    // "domáce" klient — bodyweight + voľné náčinie, nie stroje
    expect(exerciseFitsEquipment("body only", "domace_vybavenie")).toBe(true);
    expect(exerciseFitsEquipment("barbell", "domace_vybavenie")).toBe(true);
    expect(exerciseFitsEquipment("cable", "domace_vybavenie")).toBe(false);
    // plná posilňovňa — všetko
    expect(exerciseFitsEquipment("machine", "plna_posilnovna")).toBe(true);
    expect(exerciseFitsEquipment(null, "plna_posilnovna")).toBe(true);
  });
});

test.describe("región svalovej partie (horná/dolná/core)", () => {
  test("dolná časť tela", () => {
    for (const mg of ["stehná (kvadriceps)", "zadné stehná", "zadok", "lýtka", "adduktory (vnútorné stehná)", "abduktory (vonkajšie stehná)"]) {
      expect(regionForMuscleGroup(mg)).toBe("dolna");
    }
  });

  test("horná časť tela", () => {
    for (const mg of ["hrudník", "chrbát (širák)", "stredný chrbát", "ramená", "biceps", "triceps", "predlaktia", "trapézy", "krk"]) {
      expect(regionForMuscleGroup(mg)).toBe("horna");
    }
  });

  test("core (trup)", () => {
    expect(regionForMuscleGroup("brucho")).toBe("core");
    expect(regionForMuscleGroup("spodný chrbát")).toBe("core");
  });

  test("neznáma/chýbajúca partia → null", () => {
    expect(regionForMuscleGroup(null)).toBeNull();
    expect(regionForMuscleGroup(undefined)).toBeNull();
    expect(regionForMuscleGroup("neexistuje")).toBeNull();
  });
});

test.describe("analyzeFocus — rozloženie cvikov naprieč plánom", () => {
  const muscleGroupById = new Map<string, string | null>([
    ["e1", "hrudník"],
    ["e2", "zadok"],
    ["e3", "zadok"],
    ["e4", "stehná (kvadriceps)"],
    ["e5", "brucho"],
    ["e6", null],
  ]);

  test("spočíta horná/dolná/core/unknown a podiely", () => {
    const a = analyzeFocus(["e1", "e2", "e3", "e4", "e5", "e6"], muscleGroupById);
    expect(a.total).toBe(6);
    expect(a.horna).toBe(1);
    expect(a.dolna).toBe(3);
    expect(a.core).toBe(1);
    expect(a.unknown).toBe(1);
    expect(a.zadok).toBe(2);
    expect(a.hornaShare).toBeCloseTo(1 / 6);
    expect(a.dolnaShare).toBeCloseTo(3 / 6);
  });

  test("prázdny plán má nulové podiely bez delenia nulou", () => {
    const a = analyzeFocus([], muscleGroupById);
    expect(a.total).toBe(0);
    expect(a.hornaShare).toBe(0);
    expect(a.dolnaShare).toBe(0);
  });
});

test.describe("focusTargetMet", () => {
  test("vyvážene je vždy splnené, aj pri prázdnom pláne", () => {
    const empty = analyzeFocus([], new Map());
    expect(focusTargetMet(empty, "vyvazene")).toBe(true);
  });

  test("dolna vyžaduje >=50% dolnej časti AJ aspoň FOCUS_MIN_GLUTES cvikov na zadok", () => {
    const muscleGroupById = new Map<string, string | null>([
      ["e1", "zadok"],
      ["e2", "zadok"],
      ["e3", "stehná (kvadriceps)"],
      ["e4", "hrudník"],
    ]);
    const met = analyzeFocus(["e1", "e2", "e3", "e4"], muscleGroupById);
    expect(met.zadok).toBeGreaterThanOrEqual(FOCUS_MIN_GLUTES);
    expect(focusTargetMet(met, "dolna")).toBe(true);

    // dosť dolnej časti, ale nedosť "zadok" cvikov -> nesplnené
    const muscleGroupById2 = new Map<string, string | null>([
      ["e1", "zadok"],
      ["e2", "stehná (kvadriceps)"],
      ["e3", "hrudník"],
    ]);
    const notMet = analyzeFocus(["e1", "e2", "e3"], muscleGroupById2);
    expect(notMet.zadok).toBeLessThan(FOCUS_MIN_GLUTES);
    expect(focusTargetMet(notMet, "dolna")).toBe(false);
  });

  test("horna vyžaduje >=50% hornej časti", () => {
    const muscleGroupById = new Map<string, string | null>([
      ["e1", "hrudník"],
      ["e2", "biceps"],
      ["e3", "zadok"],
    ]);
    const analysis = analyzeFocus(["e1", "e2", "e3"], muscleGroupById);
    expect(focusTargetMet(analysis, "horna")).toBe(true);
  });

  test("GLUTES_MUSCLE_GROUP je presne SK reťazec \"zadok\" z knižnice", () => {
    expect(GLUTES_MUSCLE_GROUP).toBe("zadok");
  });
});
