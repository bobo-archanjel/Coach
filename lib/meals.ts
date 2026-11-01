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

/**
 * Priemerné kcal na deň jedálnička (zoznam jedálničkov v detaile klienta). Počíta len dni,
 * ktoré majú aspoň jednu položku; `meals` je JSONB z meal_days (neplatné položky sa preskočia).
 * Jedálniček bez jedál → null.
 */
export function mealPlanAvgDayKcal(days: { meals: unknown }[]): number | null {
  const dayKcal: number[] = [];
  for (const day of days) {
    const entries = (Array.isArray(day.meals) ? day.meals : []).filter(
      (e): e is FoodMacros100g & { grams: number } =>
        !!e && typeof e === "object" && Number.isFinite((e as { grams?: unknown }).grams) && Number.isFinite((e as { kcal_100g?: unknown }).kcal_100g),
    );
    if (entries.length === 0) continue;
    dayKcal.push(entries.reduce((sum, e) => sum + (e.kcal_100g * e.grams) / 100, 0));
  }
  if (dayKcal.length === 0) return null;
  return Math.round(dayKcal.reduce((a, b) => a + b, 0) / dayKcal.length);
}

/**
 * Kontrola zadaných hodnôt na 100 g: kcal by mali zhruba sedieť s 4·B + 4·S + 9·T.
 * Vráti odhad z makier, ak sa líši o viac ako `tolerance` (15 %), inak null — len
 * upozornenie, nie chyba (alkohol, vláknina či polyoly odhad prirodzene posunú).
 * Pri veľmi nízkych hodnotách (voda, light nápoje) sa nekontroluje — tam je aj
 * pár kcal rozdielu veľké percento.
 */
export function kcalMismatch(
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  tolerance = 0.15,
): { estimatedKcal: number } | null {
  if (![kcal, protein, carbs, fat].every((n) => Number.isFinite(n) && n >= 0)) return null;
  const estimated = 4 * protein + 4 * carbs + 9 * fat;
  const larger = Math.max(kcal, estimated);
  if (larger < 20) return null;
  return Math.abs(kcal - estimated) / larger > tolerance ? { estimatedKcal: Math.round(estimated) } : null;
}
