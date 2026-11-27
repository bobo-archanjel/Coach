import type { EditableMealDay, MealPlanEntryData, PortalFoodOption, PortalMealDay, PortalNutritionData, PortalNutritionResult } from "@/lib/portal/types";
import { calculateNutrition } from "@/lib/nutrition";
import { MEAL_SLOT_ORDER, scaleFoodMacros, sumMacros } from "@/lib/meals";

/* DEV náhľady sekcie Strava bez session (?preview=ok|own|trainers|empty|error): jedálniček od trénera
   aj vlastný, šablóna, potraviny pre panel buildera. Vymyslené dáta. */

const SLOT_LABEL: Record<string, string> = {
  ranajky: "Raňajky",
  desiata: "Desiata",
  obed: "Obed",
  olovrant: "Olovrant",
  vecera: "Večera",
  ine: "Iné",
};

const food = (id: string, name: string, kcal: number, p: number, c: number, f: number): PortalFoodOption => ({
  foodId: id,
  name,
  kcal100g: kcal,
  protein100g: p,
  carbs100g: c,
  fat100g: f,
  source: "import",
  servingGrams: null,
  unitBase: "g",
  pieceGrams: null,
  packageGrams: null,
  barcode: null,
});

export const PREVIEW_STAPLES: PortalFoodOption[] = [
  food("pf-ovos", "Ovsené vločky", 372, 13.5, 58.7, 7),
  food("pf-jogurt", "Grécky jogurt 2 %", 73, 9.9, 3.9, 2),
  food("pf-kura", "Kuracie prsia", 110, 23, 0, 1.6),
  food("pf-ryza", "Ryža varená", 130, 2.7, 28, 0.3),
  food("pf-banan", "Banán", 89, 1.1, 22.8, 0.3),
];

const entry = (id: string, f: PortalFoodOption, slot: MealPlanEntryData["meal_slot"], grams: number): MealPlanEntryData => ({
  entry_id: id,
  food_id: f.foodId,
  food_name: f.name,
  meal_slot: slot,
  grams,
  kcal_100g: f.kcal100g,
  protein_100g: f.protein100g,
  carbs_100g: f.carbs100g,
  fat_100g: f.fat100g,
});

const [ovos, jogurt, kura, ryza, banan] = PREVIEW_STAPLES;

const OWN_DAYS: EditableMealDay[] = [
  { id: "own-d1", name: "Pracovný deň", meals: [entry("o1", ovos, "ranajky", 80), entry("o2", jogurt, "ranajky", 150), entry("o3", kura, "obed", 180), entry("o4", ryza, "obed", 200), entry("o5", banan, "olovrant", 120)] },
  { id: "own-d2", name: "Víkend", meals: [entry("o6", jogurt, "ranajky", 200), entry("o7", kura, "vecera", 150)] },
];

const TRAINER_DAYS: EditableMealDay[] = [
  { id: "tr-d1", name: "Deň 1", meals: [entry("t1", ovos, "ranajky", 60), entry("t2", kura, "obed", 200), entry("t3", ryza, "obed", 250)] },
];

/** Rovnaký prepočet ako getPortalNutrition (lib/portal/data.ts). */
function toDays(days: EditableMealDay[]): PortalMealDay[] {
  return days.map((d) => {
    const scaled = d.meals.map((e) => ({ e, m: scaleFoodMacros(e, e.grams) }));
    const groups = MEAL_SLOT_ORDER.map((slot) => ({
      slotLabel: SLOT_LABEL[slot],
      entries: scaled
        .filter(({ e }) => e.meal_slot === slot)
        .map(({ e, m }) => ({ name: e.food_name, grams: e.grams, kcal: m.kcal, proteinG: m.proteinG, carbsG: m.carbsG, fatG: m.fatG })),
    })).filter((g) => g.entries.length > 0);
    return { id: d.id ?? d.name, name: d.name, groups, totalKcal: sumMacros(scaled.map(({ m }) => m)).kcal };
  });
}

const TRAINER_MACROS = { bmr: 1750, tdee: 2600, caloriesTarget: 2300, proteinG: 150, carbsG: 260, fatG: 70 };
const OWN_INPUTS = { sex: "zena", age: 31, weightKg: 64, heightCm: 168, activityLevel: "lahka", goal: "chudnutie" } as const;
const OWN_MACROS = calculateNutrition(OWN_INPUTS);

const BASE: PortalNutritionData = {
  macroGoal: { source: "trainer", ...TRAINER_MACROS },
  macroSetup: {
    own: null,
    trainer: { ...TRAINER_MACROS, inputs: { sex: "muz", age: 34, weightKg: 82, heightCm: 180, activityLevel: "stredna", goal: "udrzanie" } },
    defaults: { age: 34, weightKg: 82, heightCm: 180 },
  },
  mealPlanId: "meal-trainer",
  mealPlanName: "Rekompozícia — jeseň",
  mealDays: toDays(TRAINER_DAYS),
  plans: [
    { id: "meal-own", name: "Môj týždeň", source: "client", dayCount: OWN_DAYS.length },
    { id: "meal-trainer", name: "Rekompozícia — jeseň", source: "trainer", dayCount: TRAINER_DAYS.length },
  ],
  activeSource: "trainer",
  editableDays: null,
  draftOwner: "preview",
  templates: [{ id: "tpl-meal", name: "Rýchle raňajky", days: [{ id: null, name: "Deň 1", meals: [entry("s1", ovos, "ranajky", 80), entry("s2", banan, "ranajky", 120)] }] }],
};

export function previewResult(kind: string): PortalNutritionResult | null {
  if (process.env.NODE_ENV !== "development") return null;
  if (kind === "ok") return { state: "ok", data: BASE };
  if (kind === "own")
    return {
      state: "ok",
      data: { ...BASE, mealPlanId: "meal-own", mealPlanName: "Môj týždeň", mealDays: toDays(OWN_DAYS), activeSource: "client", editableDays: OWN_DAYS },
    };
  if (kind === "macros-own")
    // trénerove makrá aj aktívne vlastné — karta ukáže „Vlastné makrá“, v okne je prepínač
    return {
      state: "ok",
      data: {
        ...BASE,
        macroGoal: { source: "client", ...OWN_MACROS },
        macroSetup: { ...BASE.macroSetup, own: { ...OWN_MACROS, active: true, inputs: OWN_INPUTS } },
      },
    };
  if (kind === "macros-self")
    // klient bez trénera s vlastnými makrami
    return {
      state: "ok",
      data: {
        ...BASE,
        macroGoal: { source: "client", ...OWN_MACROS },
        macroSetup: { own: { ...OWN_MACROS, active: true, inputs: OWN_INPUTS }, trainer: null, defaults: BASE.macroSetup.defaults },
      },
    };
  if (kind === "trainers")
    // dva jedálničky od trénera, žiadny vlastný — v okne „Jedálničky“ je skupina Vlastné prázdna
    return {
      state: "ok",
      data: {
        ...BASE,
        plans: [
          { id: "meal-trainer-2", name: "Objemovka — zima", source: "trainer", dayCount: 3 },
          { id: "meal-trainer", name: "Rekompozícia — jeseň", source: "trainer", dayCount: TRAINER_DAYS.length },
        ],
      },
    };
  if (kind === "empty")
    return {
      state: "ok",
      data: { ...BASE, macroGoal: null, macroSetup: { own: null, trainer: null, defaults: { age: null, weightKg: null, heightCm: null } }, mealPlanId: null, mealPlanName: null, mealDays: [], plans: [], activeSource: null, templates: [] },
    };
  if (kind === "error") return { state: "error" };
  return null;
}
