import { test, expect } from "@playwright/test";
import {
  equipmentLevel,
  clientEquipmentLevel,
  exerciseFitsEquipment,
  regionForMuscleGroup,
  analyzeFocus,
  focusTargetMet,
} from "../lib/ai/planTaxonomy";

/**
 * Čisté funkcie AI generátora plánu (feature/ai-plan-zameranie) — bez volania
 * modelu/DB, preto sú v samostatnom module a testujú sa priamo. Overuje sa:
 * equipment hierarchia, mapovanie partií na časti tela, a kontrola zamerania.
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

test.describe("mapovanie partií na časti tela", () => {
  test("dolná / horná / core", () => {
    expect(regionForMuscleGroup("zadok")).toBe("dolna");
    expect(regionForMuscleGroup("stehná (kvadriceps)")).toBe("dolna");
    expect(regionForMuscleGroup("lýtka")).toBe("dolna");
    expect(regionForMuscleGroup("hrudník")).toBe("horna");
    expect(regionForMuscleGroup("biceps")).toBe("horna");
    expect(regionForMuscleGroup("ramená")).toBe("horna");
    expect(regionForMuscleGroup("brucho")).toBe("core");
    expect(regionForMuscleGroup("spodný chrbát")).toBe("core");
    // neznáme (vlastný cvik trénera bez partie)
    expect(regionForMuscleGroup(null)).toBeNull();
    expect(regionForMuscleGroup("čosi vlastné")).toBeNull();
  });
});

test.describe("kontrola zamerania", () => {
  const mg = new Map<string, string | null>([
    ["q1", "stehná (kvadriceps)"],
    ["q2", "zadné stehná"],
    ["g1", "zadok"],
    ["g2", "zadok"],
    ["c1", "hrudník"],
    ["c2", "hrudník"],
    ["b1", "biceps"],
    ["ab1", "brucho"],
  ]);

  test("analyzeFocus spočíta rozloženie a zadok", () => {
    const a = analyzeFocus(["q1", "q2", "g1", "g2", "c1", "c2", "b1", "ab1"], mg);
    expect(a.total).toBe(8);
    expect(a.dolna).toBe(4); // q1 q2 g1 g2
    expect(a.horna).toBe(3); // c1 c2 b1
    expect(a.core).toBe(1); // ab1
    expect(a.zadok).toBe(2);
    expect(a.dolnaShare).toBeCloseTo(0.5);
  });

  test('„vyvážene" je vždy splnené', () => {
    expect(focusTargetMet(analyzeFocus(["c1", "c2", "b1"], mg), "vyvazene")).toBe(true);
  });

  test('„viac dolná" potrebuje >=50 % dolná A >=2 cviky na zadok', () => {
    // 4/8 dolná + 2 zadok → OK
    expect(focusTargetMet(analyzeFocus(["q1", "q2", "g1", "g2", "c1", "c2", "b1", "ab1"], mg), "dolna")).toBe(true);
    // dosť dolnej, ale len 1 zadok → nesplnené
    expect(focusTargetMet(analyzeFocus(["q1", "q2", "g1", "c1"], mg), "dolna")).toBe(false);
    // 2 zadok, ale málo dolnej celkovo (2/6) → nesplnené
    expect(focusTargetMet(analyzeFocus(["g1", "g2", "c1", "c2", "b1", "ab1"], mg), "dolna")).toBe(false);
  });

  test('„viac horná" potrebuje >=50 % horná', () => {
    expect(focusTargetMet(analyzeFocus(["c1", "c2", "b1", "q1"], mg), "horna")).toBe(true);
    expect(focusTargetMet(analyzeFocus(["c1", "q1", "q2", "g1"], mg), "horna")).toBe(false);
  });
});
