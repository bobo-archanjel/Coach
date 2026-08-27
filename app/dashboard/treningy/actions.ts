"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error: string | null;
}

const initialOk: ActionState = { error: null };

export async function createPlanAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const clientId = formData.get("client_id") as string | null;
  const name = (formData.get("name") as string | null)?.trim() ?? "";

  if (!clientId) return { error: "Vyber klienta." };
  if (!name) return { error: "Zadaj názov plánu." };

  const { data, error } = await supabase
    .from("workout_plans")
    .insert({ client_id: clientId, trainer_id: user.id, name })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Plán sa nepodarilo vytvoriť." };

  revalidatePath("/dashboard/treningy");
  redirect(`/dashboard/treningy/${data.id}`);
}

export async function addDayAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const planId = formData.get("plan_id") as string | null;
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const dayNumber = Number(formData.get("day_number"));

  if (!planId) return { error: "Chýba ID plánu." };
  if (!name) return { error: "Zadaj názov dňa." };

  const { error } = await supabase.from("workout_days").insert({
    plan_id: planId,
    day_number: Number.isFinite(dayNumber) ? dayNumber : 1,
    name,
    exercises: [],
  });

  if (error) return { error: error.message };

  revalidatePath(`/dashboard/treningy/${planId}`);
  return initialOk;
}

export async function addExerciseToDayAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();

  const dayId = formData.get("day_id") as string | null;
  const planId = formData.get("plan_id") as string | null;
  const exerciseId = formData.get("exercise_id") as string | null;
  const sets = Number(formData.get("sets"));
  const reps = (formData.get("reps") as string | null)?.trim() ?? "";
  const loadRaw = (formData.get("load_kg") as string | null)?.trim();
  const tempo = (formData.get("tempo") as string | null)?.trim() || null;
  const restRaw = (formData.get("rest_seconds") as string | null)?.trim();

  if (!dayId || !planId) return { error: "Chýba ID dňa." };
  if (!exerciseId) return { error: "Vyber cvik." };
  if (!Number.isFinite(sets) || sets < 1) return { error: "Zadaj počet sérií." };
  if (!reps) return { error: "Zadaj opakovania." };

  const { data: exercise } = await supabase.from("exercises").select("name").eq("id", exerciseId).maybeSingle();
  if (!exercise) return { error: "Cvik sa nenašiel." };

  const { data: day } = await supabase.from("workout_days").select("exercises").eq("id", dayId).maybeSingle();
  if (!day) return { error: "Deň sa nenašiel." };

  const newEntry = {
    exercise_id: exerciseId,
    exercise_name: exercise.name,
    sets,
    reps,
    load_kg: loadRaw ? Number(loadRaw) : null,
    tempo,
    rest_seconds: restRaw ? Number(restRaw) : null,
  };

  const updatedExercises = [...(Array.isArray(day.exercises) ? day.exercises : []), newEntry];

  const { error } = await supabase.from("workout_days").update({ exercises: updatedExercises }).eq("id", dayId);
  if (error) return { error: error.message };

  revalidatePath(`/dashboard/treningy/${planId}`);
  return initialOk;
}

export async function addCustomExerciseAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const muscleGroup = (formData.get("muscle_group") as string | null)?.trim() || null;

  if (!name) return { error: "Zadaj názov cviku." };

  const { error } = await supabase.from("exercises").insert({
    trainer_id: user.id,
    name,
    muscle_group: muscleGroup,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard/treningy");
  return initialOk;
}
