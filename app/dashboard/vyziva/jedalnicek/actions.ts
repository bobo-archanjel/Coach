"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MealSlot } from "@/lib/meals";
import { dbErr } from "@/lib/dbError";

export interface ActionState {
  error: string | null;
}

const ok: ActionState = { error: null };

export interface MealEntry {
  entry_id: string;
  food_id: string;
  food_name: string;
  meal_slot: MealSlot;
  grams: number;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
}

export async function createMealPlanAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const clientId = formData.get("client_id") as string | null;
  const name = (formData.get("name") as string | null)?.trim() ?? "";

  if (!clientId) return { error: "Chýba klient." };
  if (!name) return { error: "Zadaj názov jedálničku." };

  const { data, error } = await supabase
    .from("meal_plans")
    // Koncept — klient ho uvidí až po "Potvrdiť a zverejniť" (0044).
    .insert({ client_id: clientId, trainer_id: user.id, name, published: false })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Jedálniček sa nepodarilo vytvoriť." };

  revalidatePath(`/dashboard/vyziva/${clientId}`);
  redirect(`/dashboard/vyziva/jedalnicek/${data.id}`);
}

/** Zverejnenie jedálnička — kým je koncept, klient ho v portáli nevidí (0044). */
export async function publishMealPlanAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const planId = formData.get("plan_id") as string | null;
  if (!planId) return { error: "Chýba ID jedálnička." };

  const { data, error } = await supabase
    .from("meal_plans")
    .update({ published: true })
    .eq("id", planId)
    .eq("trainer_id", user.id)
    .select("client_id")
    .maybeSingle();
  if (error) return { error: dbErr(error, "actions") };
  if (!data) return { error: "Jedálniček sa nenašiel." };

  revalidatePath(`/dashboard/vyziva/jedalnicek/${planId}`);
  revalidatePath(`/dashboard/vyziva/${data.client_id}`);
  return ok;
}

/**
 * Zmazanie jedálnička (aj zverejneného — na rozdiel od tréningového plánu tu
 * nevisí história odcvičených tréningov; denník jedla je v food_logs, ten ostáva).
 * UI pýta dvojkrokové potvrdenie. meal_days zmaže kaskáda.
 */
export async function deleteMealPlanAction(planId: string): Promise<ActionState> {
  if (!planId) return { error: "Chýba ID jedálnička." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const { data: plan } = await supabase
    .from("meal_plans")
    .select("client_id")
    .eq("id", planId)
    .eq("trainer_id", user.id)
    .maybeSingle();
  if (!plan) return { error: "Jedálniček sa nenašiel." };

  const { error } = await supabase.from("meal_plans").delete().eq("id", planId).eq("trainer_id", user.id);
  if (error) return { error: dbErr(error, "actions") };

  revalidatePath(`/dashboard/vyziva/${plan.client_id}`);
  redirect(`/dashboard/vyziva/${plan.client_id}`);
}

export async function renameMealPlanAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const planId = formData.get("plan_id") as string | null;
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  if (!planId) return { error: "Chýba ID jedálnička." };
  if (!name) return { error: "Zadaj názov jedálnička." };

  const { data, error } = await supabase
    .from("meal_plans")
    .update({ name })
    .eq("id", planId)
    .eq("trainer_id", user.id)
    .select("client_id")
    .maybeSingle();
  if (error) return { error: dbErr(error, "actions") };
  if (!data) return { error: "Jedálniček sa nenašiel." };

  revalidatePath(`/dashboard/vyziva/jedalnicek/${planId}`);
  revalidatePath(`/dashboard/vyziva/${data.client_id}`);
  return ok;
}

export async function renameMealDayAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const dayId = formData.get("day_id") as string | null;
  const planId = formData.get("plan_id") as string | null;
  const name = (formData.get("name") as string | null)?.trim() ?? "";

  if (!dayId || !planId) return { error: "Chýba identifikátor dňa." };
  if (!name) return { error: "Zadaj názov dňa." };

  // RLS (meal_days_update_own_trainer) pustí len deň vlastného jedálnička.
  const { data, error } = await supabase.from("meal_days").update({ name }).eq("id", dayId).select("id").maybeSingle();
  if (error) return { error: dbErr(error, "actions") };
  if (!data) return { error: "Deň sa nenašiel." };

  revalidatePath(`/dashboard/vyziva/jedalnicek/${planId}`);
  return ok;
}

export async function deleteMealDayAction(dayId: string, planId: string): Promise<ActionState> {
  if (!dayId || !planId) return { error: "Chýba identifikátor dňa." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("meal_days").delete().eq("id", dayId).select("id").maybeSingle();
  if (error) return { error: dbErr(error, "actions") };
  if (!data) return { error: "Deň sa nenašiel." };

  revalidatePath(`/dashboard/vyziva/jedalnicek/${planId}`);
  return ok;
}

export async function addMealDayAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const planId = formData.get("plan_id") as string | null;
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const dayNumber = Number(formData.get("day_number"));

  if (!planId) return { error: "Chýba ID plánu." };
  if (!name) return { error: "Zadaj názov dňa." };

  const { error } = await supabase.from("meal_days").insert({
    plan_id: planId,
    day_number: Number.isFinite(dayNumber) ? dayNumber : 1,
    name,
    meals: [],
  });

  if (error) return { error: dbErr(error, "actions") };

  revalidatePath(`/dashboard/vyziva/jedalnicek/${planId}`);
  return ok;
}

/** Klik na potravinu v knižnici → pridá ju do aktívneho dňa (100 g, raňajky), rovno editovateľné. */
export async function addFoodToDayAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();

  const dayId = formData.get("day_id") as string | null;
  const planId = formData.get("plan_id") as string | null;
  const foodId = formData.get("food_id") as string | null;

  if (!dayId) return { error: "Najprv vytvor alebo vyber deň." };
  if (!planId) return { error: "Chýba ID plánu." };
  if (!foodId) return { error: "Vyber potravinu." };

  const { data: food } = await supabase
    .from("foods")
    .select("name, kcal_100g, protein_100g, carbs_100g, fat_100g")
    .eq("id", foodId)
    .maybeSingle();
  if (!food) return { error: "Potravina sa nenašla." };

  const { data: day } = await supabase.from("meal_days").select("meals").eq("id", dayId).maybeSingle();
  if (!day) return { error: "Deň sa nenašiel." };

  const newEntry: MealEntry = {
    entry_id: randomUUID(),
    food_id: foodId,
    food_name: food.name,
    meal_slot: "ranajky",
    grams: 100,
    kcal_100g: food.kcal_100g,
    protein_100g: food.protein_100g,
    carbs_100g: food.carbs_100g,
    fat_100g: food.fat_100g,
  };

  const current = (Array.isArray(day.meals) ? day.meals : []) as MealEntry[];
  const { error } = await supabase
    .from("meal_days")
    .update({ meals: [...current, newEntry] })
    .eq("id", dayId);

  if (error) return { error: dbErr(error, "actions") };

  revalidatePath(`/dashboard/vyziva/jedalnicek/${planId}`);
  return ok;
}

export async function updateMealEntryAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();

  const dayId = formData.get("day_id") as string | null;
  const planId = formData.get("plan_id") as string | null;
  const entryId = formData.get("entry_id") as string | null;
  const mealSlot = formData.get("meal_slot") as MealSlot | null;
  const grams = Number(formData.get("grams"));

  if (!dayId || !planId || !entryId) return { error: "Chýba identifikátor záznamu." };
  if (!mealSlot) return { error: "Vyber jedlo dňa." };
  if (!Number.isFinite(grams) || grams <= 0) return { error: "Zadaj gramáž." };

  const { data: day } = await supabase.from("meal_days").select("meals").eq("id", dayId).maybeSingle();
  if (!day) return { error: "Deň sa nenašiel." };

  const current = (Array.isArray(day.meals) ? day.meals : []) as MealEntry[];
  const updated = current.map((entry) =>
    entry.entry_id === entryId ? { ...entry, meal_slot: mealSlot, grams } : entry
  );

  const { error } = await supabase.from("meal_days").update({ meals: updated }).eq("id", dayId);
  if (error) return { error: dbErr(error, "actions") };

  revalidatePath(`/dashboard/vyziva/jedalnicek/${planId}`);
  return ok;
}

export async function removeMealEntryAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();

  const dayId = formData.get("day_id") as string | null;
  const planId = formData.get("plan_id") as string | null;
  const entryId = formData.get("entry_id") as string | null;

  if (!dayId || !planId || !entryId) return { error: "Chýba identifikátor záznamu." };

  const { data: day } = await supabase.from("meal_days").select("meals").eq("id", dayId).maybeSingle();
  if (!day) return { error: "Deň sa nenašiel." };

  const current = (Array.isArray(day.meals) ? day.meals : []) as MealEntry[];
  const updated = current.filter((entry) => entry.entry_id !== entryId);

  const { error } = await supabase.from("meal_days").update({ meals: updated }).eq("id", dayId);
  if (error) return { error: dbErr(error, "actions") };

  revalidatePath(`/dashboard/vyziva/jedalnicek/${planId}`);
  return ok;
}

export async function addCustomFoodAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const kcal = Number(formData.get("kcal_100g"));
  const protein = Number(formData.get("protein_100g"));
  const carbs = Number(formData.get("carbs_100g"));
  const fat = Number(formData.get("fat_100g"));

  if (!name) return { error: "Zadaj názov potraviny." };
  if (![kcal, protein, carbs, fat].every((n) => Number.isFinite(n) && n >= 0)) {
    return { error: "Zadaj platné makrá na 100 g." };
  }

  const { error } = await supabase.from("foods").insert({
    trainer_id: user.id,
    name,
    kcal_100g: kcal,
    protein_100g: protein,
    carbs_100g: carbs,
    fat_100g: fat,
  });

  if (error) return { error: dbErr(error, "actions") };

  return ok;
}
