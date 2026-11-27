// Čisté funkcie na výpočet BMR/TDEE a makro cieľa — bez závislosti na serveri/klientovi,
// takže sa dajú použiť pre server-side uloženie (actions.ts) aj klientský live náhľad (NutritionForm.tsx).
// Vzorec: Mifflin-St Jeor (presnejší než staršie Harris-Benedict pre bežnú populáciu).

export type Sex = "muz" | "zena";
export type ActivityLevel = "sedavy" | "lahka" | "stredna" | "vysoka" | "velmi_vysoka";
export type Goal = "chudnutie" | "udrzanie" | "naberanie";

// i18n-ignore-start — slovenské popisy pre prompt AI (UI: labels.activity / labels.goal)
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

// i18n-ignore-end
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

// ---------- Zdieľaná validácia (tréner aj klient) ----------
// Hranice zhodné s DB (0004: vek < 120; 0070: váha <= 500, výška <= 300; 0089 rovnako) a s UI.

export const SEX_VALUES: readonly Sex[] = ["muz", "zena"];
export const ACTIVITY_VALUES: readonly ActivityLevel[] = ["sedavy", "lahka", "stredna", "vysoka", "velmi_vysoka"];
export const GOAL_VALUES: readonly Goal[] = ["chudnutie", "udrzanie", "naberanie"];

/** Kľúče z messages/<jazyk>/errors.json (pre tErr). */
export type NutritionErrorKey =
  | "meals.chooseSex"
  | "meals.invalidAge"
  | "meals.invalidWeight"
  | "meals.invalidHeight"
  | "meals.chooseActivity"
  | "plans.chooseGoal"
  | "meals.invalidMacros"
  | "meals.macroKcalRange";

export type Validated<T> = { ok: true; value: T } | { ok: false; error: NutritionErrorKey };

/** Vstupy z formulára/JSON (surové, nedôveryhodné) → overené NutritionInput. */
export function validateNutritionInput(raw: {
  sex?: unknown;
  age?: unknown;
  weightKg?: unknown;
  heightCm?: unknown;
  activityLevel?: unknown;
  goal?: unknown;
}): Validated<NutritionInput> {
  const sex = raw.sex as Sex;
  const age = Number(raw.age);
  const weightKg = Number(raw.weightKg);
  const heightCm = Number(raw.heightCm);
  const activityLevel = raw.activityLevel as ActivityLevel;
  const goal = raw.goal as Goal;
  if (!SEX_VALUES.includes(sex)) return { ok: false, error: "meals.chooseSex" };
  if (!Number.isInteger(age) || age < 10 || age > 119) return { ok: false, error: "meals.invalidAge" };
  if (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 500) return { ok: false, error: "meals.invalidWeight" };
  if (!Number.isFinite(heightCm) || heightCm < 80 || heightCm > 300) return { ok: false, error: "meals.invalidHeight" };
  if (!ACTIVITY_VALUES.includes(activityLevel)) return { ok: false, error: "meals.chooseActivity" };
  if (!GOAL_VALUES.includes(goal)) return { ok: false, error: "plans.chooseGoal" };
  return { ok: true, value: { sex, age, weightKg, heightCm, activityLevel, goal } };
}

export interface ManualMacros {
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** Kalorický cieľ z makier (4/4/9 kcal na gram). */
export function caloriesFromMacros(m: ManualMacros): number {
  return m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9;
}

/** Ručne zadané makrá: celé gramy v rozsahu a súčet 800–8000 kcal. */
export function validateManualMacros(raw: unknown): Validated<{ macros: ManualMacros; kcal: number }> {
  const r = (raw ?? {}) as Partial<Record<keyof ManualMacros, unknown>>;
  const okGram = (n: unknown, max: number): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= max;
  if (!okGram(r.proteinG, 500) || !okGram(r.carbsG, 1500) || !okGram(r.fatG, 400)) return { ok: false, error: "meals.invalidMacros" };
  const macros = { proteinG: r.proteinG, carbsG: r.carbsG, fatG: r.fatG };
  const kcal = caloriesFromMacros(macros);
  if (kcal < 800 || kcal > 8000) return { ok: false, error: "meals.macroKcalRange" };
  return { ok: true, value: { macros, kcal } };
}

/**
 * Výsledok na uloženie: automatický výpočet, alebo ručne upravené makrá (kalorický cieľ = súčet makier;
 * BMR/TDEE ostávajú z výpočtu). Rovnaké hodnoty ako výpočet = uloží presne výpočet (aj jeho kcal).
 */
export function applyManualMacros(auto: NutritionResult, manual: { macros: ManualMacros; kcal: number } | null): NutritionResult {
  if (!manual) return auto;
  const { macros, kcal } = manual;
  const same = auto.proteinG === macros.proteinG && auto.carbsG === macros.carbsG && auto.fatG === macros.fatG;
  return { bmr: auto.bmr, tdee: auto.tdee, caloriesTarget: same ? auto.caloriesTarget : kcal, ...macros };
}
