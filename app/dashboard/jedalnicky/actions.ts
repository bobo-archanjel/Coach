"use server";

import { trainerBlock } from "@/lib/billing/server";
import { tErr } from "@/lib/i18n/serverErrors";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { calculateNutrition, type ActivityLevel, type Goal, type Sex } from "@/lib/nutrition";

export interface ActionState {
  error: string | null;
}
const ok: ActionState = { error: null };

const SEX_VALUES: Sex[] = ["muz", "zena"];
const ACTIVITY_VALUES: ActivityLevel[] = ["sedavy", "lahka", "stredna", "vysoka", "velmi_vysoka"];
const GOAL_VALUES: Goal[] = ["chudnutie", "udrzanie", "naberanie"];

export async function saveNutritionProfileAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const blocked = await trainerBlock();
  if (blocked) return { error: blocked };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: await tErr("notSignedIn") };
  }

  const clientId = formData.get("client_id")?.toString();
  const sex = formData.get("sex")?.toString() as Sex;
  const age = Number(formData.get("age"));
  const weightKg = Number(formData.get("weight_kg"));
  const heightCm = Number(formData.get("height_cm"));
  const activityLevel = formData.get("activity_level")?.toString() as ActivityLevel;
  const goal = formData.get("goal")?.toString() as Goal;
  const notes = formData.get("notes")?.toString().trim() || null;

  if (!clientId) return { error: await tErr("missingClient") };
  if (!SEX_VALUES.includes(sex)) return { error: "Vyber pohlavie." };
  // hranice zhodné s DB (0004: vek < 120; 0070: váha <= 500, výška <= 300) a s UI
  if (!Number.isInteger(age) || age < 10 || age > 119) return { error: await tErr("meals.invalidAge") };
  if (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 500) return { error: await tErr("meals.invalidWeight") };
  if (!Number.isFinite(heightCm) || heightCm < 80 || heightCm > 300) return { error: await tErr("meals.invalidHeight") };
  if (!ACTIVITY_VALUES.includes(activityLevel)) return { error: await tErr("meals.chooseActivity") };
  if (!GOAL_VALUES.includes(goal)) return { error: await tErr("plans.chooseGoal") };

  const result = calculateNutrition({ sex, age, weightKg, heightCm, activityLevel, goal });

  const { error } = await supabase.from("nutrition_profiles").upsert(
    {
      client_id: clientId,
      trainer_id: user.id,
      sex,
      age,
      weight_kg: weightKg,
      height_cm: heightCm,
      activity_level: activityLevel,
      goal,
      bmr: result.bmr,
      tdee: result.tdee,
      calories_target: result.caloriesTarget,
      protein_g: result.proteinG,
      carbs_g: result.carbsG,
      fat_g: result.fatG,
    },
    { onConflict: "client_id" },
  );

  if (error) {
    console.error("saveNutritionProfileAction:", error.message);
    return { error: await tErr("meals.macroSaveFailed") };
  }

  // Súkromná poznámka trénera k výžive ide do trainer_private_notes (0036): stĺpec
  // nutrition_profiles.notes číta aj sám klient (RLS je riadková). Prázdna poznámka = zmazať.
  if (notes) {
    const { error: noteErr } = await supabase
      .from("trainer_private_notes")
      .upsert(
        { client_id: clientId, scope: "nutrition", trainer_id: user.id, notes: notes.slice(0, 4000), updated_at: new Date().toISOString() },
        { onConflict: "client_id,scope" },
      );
    if (noteErr) console.error("saveNutritionProfileAction (poznámka):", noteErr.message);
  } else {
    await supabase.from("trainer_private_notes").delete().eq("client_id", clientId).eq("scope", "nutrition");
  }

  revalidatePath("/dashboard/jedalnicky");
  revalidatePath(`/dashboard/klienti/${clientId}`);

  return ok;
}

type ProfileInputs = { sex: Sex; age: number; weight_kg: number; height_cm: number; activity_level: ActivityLevel; goal: Goal };

/** Uložený profil klienta (vstupy pre výpočet) — RLS: len tréner klienta. */
async function loadProfileInputs(supabase: Awaited<ReturnType<typeof createClient>>, clientId: string) {
  const { data } = await supabase
    .from("nutrition_profiles")
    .select("sex, age, weight_kg, height_cm, activity_level, goal")
    .eq("client_id", clientId)
    .maybeSingle();
  return (data as ProfileInputs | null) ?? null;
}

/**
 * Ručne upravené makrá (tréner nesúhlasí s automatickým výpočtom). Kalorický cieľ = súčet
 * makier (4/4/9 kcal na gram), aby čísla vždy sedeli. BMR a TDEE ostávajú z výpočtu.
 * Rovnaké hodnoty ako výpočet = uloží presne výpočet (aj jeho kalorický cieľ).
 */
export async function saveManualMacrosAction(
  clientId: string,
  macros: { proteinG: number; carbsG: number; fatG: number },
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: await tErr("notSignedIn") };
  if (typeof clientId !== "string" || !clientId) return { error: await tErr("missingClient") };

  const { proteinG, carbsG, fatG } = macros ?? ({} as typeof macros);
  const okGram = (n: unknown, max: number) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= max;
  if (!okGram(proteinG, 500) || !okGram(carbsG, 1500) || !okGram(fatG, 400)) return { error: await tErr("meals.invalidMacros") };
  const kcal = proteinG * 4 + carbsG * 4 + fatG * 9;
  if (kcal < 800 || kcal > 8000) return { error: await tErr("meals.macroKcalRange") };

  const inputs = await loadProfileInputs(supabase, clientId);
  if (!inputs) return { error: await tErr("meals.macroProfileMissing") };
  const auto = calculateNutrition({
    sex: inputs.sex,
    age: Number(inputs.age),
    weightKg: Number(inputs.weight_kg),
    heightCm: Number(inputs.height_cm),
    activityLevel: inputs.activity_level,
    goal: inputs.goal,
  });
  const same = auto.proteinG === proteinG && auto.carbsG === carbsG && auto.fatG === fatG;

  const { error } = await supabase
    .from("nutrition_profiles")
    .update({
      bmr: auto.bmr,
      tdee: auto.tdee,
      calories_target: same ? auto.caloriesTarget : kcal,
      protein_g: proteinG,
      carbs_g: carbsG,
      fat_g: fatG,
    })
    .eq("client_id", clientId);
  if (error) {
    console.error("saveManualMacrosAction:", error.message);
    return { error: await tErr("meals.macroSaveFailed") };
  }
  revalidatePath("/dashboard/jedalnicky");
  revalidatePath(`/dashboard/klienti/${clientId}`);
  return ok;
}
