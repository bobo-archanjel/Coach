"use server";

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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Nie si prihlásený." };
  }

  const clientId = formData.get("client_id")?.toString();
  const sex = formData.get("sex")?.toString() as Sex;
  const age = Number(formData.get("age"));
  const weightKg = Number(formData.get("weight_kg"));
  const heightCm = Number(formData.get("height_cm"));
  const activityLevel = formData.get("activity_level")?.toString() as ActivityLevel;
  const goal = formData.get("goal")?.toString() as Goal;
  const notes = formData.get("notes")?.toString().trim() || null;

  if (!clientId) return { error: "Chýba klient." };
  if (!SEX_VALUES.includes(sex)) return { error: "Vyber pohlavie." };
  if (!Number.isFinite(age) || age <= 0 || age >= 120) return { error: "Neplatný vek." };
  if (!Number.isFinite(weightKg) || weightKg <= 0) return { error: "Neplatná váha." };
  if (!Number.isFinite(heightCm) || heightCm <= 0) return { error: "Neplatná výška." };
  if (!ACTIVITY_VALUES.includes(activityLevel)) return { error: "Vyber úroveň aktivity." };
  if (!GOAL_VALUES.includes(goal)) return { error: "Vyber cieľ." };

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
      notes,
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
    return { error: error.message };
  }

  revalidatePath(`/dashboard/vyziva/${clientId}`);
  revalidatePath("/dashboard/vyziva");
  revalidatePath(`/dashboard/klienti/${clientId}`);

  return ok;
}
