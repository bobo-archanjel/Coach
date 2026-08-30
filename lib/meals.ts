// Čisté funkcie na prepočet makier potraviny (na 100 g) na zvolenú gramáž a súčty
// naprieč zoznamom položiek — použiteľné server-side (actions.ts) aj klientsky
// (live náhľad pri úprave gramáže). Rovnaký vzor ako lib/nutrition.ts.

export type MealSlot = "ranajky" | "desiata" | "obed" | "olovrant" | "vecera" | "ine";

export const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  ranajky: "Raňajky",
  desiata: "Desiata",
  obed: "Obed",
  olovrant: "Olovrant",
  vecera: "Večera",
  ine: "Iné",
};

export const MEAL_SLOT_ORDER: MealSlot[] = ["ranajky", "desiata", "obed", "olovrant", "vecera", "ine"];

export interface FoodMacros100g {
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
}

export interface ScaledMacros {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** Prepočíta makrá potraviny (na 100 g) na zadanú gramáž. */
export function scaleFoodMacros(food: FoodMacros100g, grams: number): ScaledMacros {
  const factor = grams / 100;
  return {
    kcal: Math.round(food.kcal_100g * factor),
    proteinG: Math.round(food.protein_100g * factor * 10) / 10,
    carbsG: Math.round(food.carbs_100g * factor * 10) / 10,
    fatG: Math.round(food.fat_100g * factor * 10) / 10,
  };
}

/** Súčet makier naprieč zoznamom už prepočítaných položiek (napr. celý deň). */
export function sumMacros(items: ScaledMacros[]): ScaledMacros {
  return items.reduce(
    (acc, m) => ({
      kcal: acc.kcal + m.kcal,
      proteinG: Math.round((acc.proteinG + m.proteinG) * 10) / 10,
      carbsG: Math.round((acc.carbsG + m.carbsG) * 10) / 10,
      fatG: Math.round((acc.fatG + m.fatG) * 10) / 10,
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}
