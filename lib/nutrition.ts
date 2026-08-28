// Čisté funkcie na výpočet BMR/TDEE a makro cieľa — bez závislosti na serveri/klientovi,
// takže sa dajú použiť pre server-side uloženie (actions.ts) aj klientský live náhľad (NutritionForm.tsx).
// Vzorec: Mifflin-St Jeor (presnejší než staršie Harris-Benedict pre bežnú populáciu).

export type Sex = "muz" | "zena";
export type ActivityLevel = "sedavy" | "lahka" | "stredna" | "vysoka" | "velmi_vysoka";
export type Goal = "chudnutie" | "udrzanie" | "naberanie";

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedavy: "Sedavý (kancelária, žiadny šport)",
  lahka: "Ľahká aktivita (1–3× týždenne)",
  stredna: "Stredná aktivita (3–5× týždenne)",
  vysoka: "Vysoká aktivita (6–7× týždenne)",
  velmi_vysoka: "Veľmi vysoká (fyzická práca + šport)",
};

export const GOAL_LABELS: Record<Goal, string> = {
  chudnutie: "Chudnutie",
  udrzanie: "Udržanie",
  naberanie: "Naberanie",
};

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedavy: 1.2,
  lahka: 1.375,
  stredna: 1.55,
  vysoka: 1.725,
  velmi_vysoka: 1.9,
};

const GOAL_CALORIE_ADJUSTMENT: Record<Goal, number> = {
  chudnutie: -500,
  udrzanie: 0,
  naberanie: 300,
};

export interface NutritionInput {
  sex: Sex;
  age: number;
  weightKg: number;
  heightCm: number;
  activityLevel: ActivityLevel;
  goal: Goal;
}

export interface NutritionResult {
  bmr: number;
  tdee: number;
  caloriesTarget: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/**
 * BMR (Mifflin-St Jeor) → TDEE (× aktivita) → kalorický cieľ (± podľa cieľa) → makrá
 * (bielkoviny 2 g/kg a tuky 0.9 g/kg ako bezpečný fitness štandard, zvyšok kalórií na sacharidy).
 */
export function calculateNutrition(input: NutritionInput): NutritionResult {
  const { sex, age, weightKg, heightCm, activityLevel, goal } = input;

  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  const bmr = sex === "muz" ? base + 5 : base - 161;
  const tdee = bmr * ACTIVITY_MULTIPLIERS[activityLevel];
  const caloriesTarget = Math.max(1200, tdee + GOAL_CALORIE_ADJUSTMENT[goal]);

  const proteinG = weightKg * 2;
  const fatG = weightKg * 0.9;
  const remainingKcal = Math.max(0, caloriesTarget - (proteinG * 4 + fatG * 9));
  const carbsG = remainingKcal / 4;

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    caloriesTarget: Math.round(caloriesTarget),
    proteinG: Math.round(proteinG),
    carbsG: Math.round(carbsG),
    fatG: Math.round(fatG),
  };
}
