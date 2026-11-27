"use server";

import { trainerBlock } from "@/lib/billing/server";
import { tErr } from "@/lib/i18n/serverErrors";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { applyManualMacros, calculateNutrition, validateManualMacros, validateNutritionInput, type ActivityLevel, type Goal, type Sex } from "@/lib/nutrition";

export interface ActionState {
  error: string | null;
}
const ok: ActionState = { error: null };

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
  const notes = formData.get("notes")?.toString().trim() || null;

  if (!clientId) return { error: await tErr("missingClient") };
  const parsed = validateNutritionInput({
    sex: formData.get("sex")?.toString(),
    age: formData.get("age"),
    weightKg: formData.get("weight_kg"),
    heightCm: formData.get("height_cm"),
    activityLevel: formData.get("activity_level")?.toString(),
    goal: formData.get("goal")?.toString(),
  });
  if (!parsed.ok) return { error: await tErr(parsed.error) };
  const { sex, age, weightKg, heightCm, activityLevel, goal } = parsed.value;

  const result = calculateNutrition(parsed.value);

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

  const manual = validateManualMacros(macros);
  if (!manual.ok) return { error: await tErr(manual.error) };

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
  const final = applyManualMacros(auto, manual.value);

  const { error } = await supabase
    .from("nutrition_profiles")
    .update({
      bmr: final.bmr,
      tdee: final.tdee,
      calories_target: final.caloriesTarget,
      protein_g: final.proteinG,
      carbs_g: final.carbsG,
      fat_g: final.fatG,
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
