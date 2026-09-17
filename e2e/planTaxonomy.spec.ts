import { test, expect } from "@playwright/test";
import { equipmentLevel, clientEquipmentLevel, exerciseFitsEquipment } from "../lib/ai/planTaxonomy";

/**
 * Čisté funkcie AI generátora plánu — vybavenie ako štrukturálny filter
 * (feature/ai-plan-zameranie). Bez volania modelu/DB, preto sú v samostatnom
 * module a testujú sa priamo. Rozdelenie na dni/kategórie a "Zameranie" select
 * majú vlastnú sadu v `e2e/planCategories.spec.ts` (feature/ai-plan-kategorie)
 * — tento súbor sa od nahradenia voľného pomeru kategóriovým systémom venuje
 * už len equipment hierarchii.
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
