"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchExerciseDetail, type ExerciseDetail } from "@/lib/exercises";

export interface ActionState {
  error: string | null;
}

const ok: ActionState = { error: null };

/** Detail cviku (obrázky + inštrukcie z Free Exercise DB) pre náhľadový modal v builderi. */
export async function getExerciseDetailAction(exerciseId: string): Promise<ExerciseDetail | null> {
  const supabase = await createClient();
  return fetchExerciseDetail(supabase, exerciseId);
}

export interface WorkoutExerciseEntry {
  entry_id: string;
  exercise_id: string;
  exercise_name: string;
  sets: number;
  reps: string;
  load_kg: number | null;
  tempo: string | null;
  rest_seconds: number | null;
}

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
    // Nový plán je koncept (published: false), kým ho tréner výslovne nepotvrdí
    // tlačidlom "Potvrdiť a uložiť" — dovtedy ho klient v portáli nevidí.
    .insert({ client_id: clientId, trainer_id: user.id, name, published: false })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Plán sa nepodarilo vytvoriť." };

  revalidatePath("/dashboard/treningy");
  redirect(`/dashboard/treningy/${data.id}`);
}

/** Potvrdenie/koncept plánu — kým je `published: false`, klient ho v portáli nevidí. */
export async function setPlanPublishedAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const planId = formData.get("plan_id") as string | null;
  const published = formData.get("published") === "true";
  if (!planId) return { error: "Chýba ID plánu." };

  const { error } = await supabase
    .from("workout_plans")
    .update({ published })
    .eq("id", planId)
    .eq("trainer_id", user.id);

  if (error) return { error: error.message };

  revalidatePath(`/dashboard/treningy/${planId}`);
  revalidatePath("/dashboard/treningy");
  return ok;
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
  return ok;
}

/** Klik na cvik v knižnici → pridá ho do aktívneho dňa s rozumnými defaultmi (rovno editovateľné). */
export async function addExerciseToDayAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();

  const dayId = formData.get("day_id") as string | null;
  const planId = formData.get("plan_id") as string | null;
  const exerciseId = formData.get("exercise_id") as string | null;

  if (!dayId) return { error: "Najprv vytvor alebo vyber deň." };
  if (!planId) return { error: "Chýba ID plánu." };
  if (!exerciseId) return { error: "Vyber cvik." };

  const { data: exercise } = await supabase.from("exercises").select("name").eq("id", exerciseId).maybeSingle();
  if (!exercise) return { error: "Cvik sa nenašiel." };

  const { data: day } = await supabase.from("workout_days").select("exercises").eq("id", dayId).maybeSingle();
  if (!day) return { error: "Deň sa nenašiel." };

  const newEntry: WorkoutExerciseEntry = {
    entry_id: randomUUID(),
    exercise_id: exerciseId,
    exercise_name: exercise.name,
    sets: 3,
    reps: "10",
    load_kg: null,
    tempo: null,
    rest_seconds: 90,
  };

  const current = (Array.isArray(day.exercises) ? day.exercises : []) as WorkoutExerciseEntry[];
  const { error } = await supabase
    .from("workout_days")
    .update({ exercises: [...current, newEntry] })
    .eq("id", dayId);

  if (error) return { error: error.message };

  revalidatePath(`/dashboard/treningy/${planId}`);
  return ok;
}

export async function updateExerciseEntryAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();

  const dayId = formData.get("day_id") as string | null;
  const planId = formData.get("plan_id") as string | null;
  const entryId = formData.get("entry_id") as string | null;
  const sets = Number(formData.get("sets"));
  const reps = (formData.get("reps") as string | null)?.trim() ?? "";
  const loadRaw = (formData.get("load_kg") as string | null)?.trim();
  const tempo = (formData.get("tempo") as string | null)?.trim() || null;
  const restRaw = (formData.get("rest_seconds") as string | null)?.trim();

  if (!dayId || !planId || !entryId) return { error: "Chýba identifikátor záznamu." };
  if (!Number.isFinite(sets) || sets < 1) return { error: "Zadaj počet sérií." };
  if (!reps) return { error: "Zadaj opakovania." };

  const { data: day } = await supabase.from("workout_days").select("exercises").eq("id", dayId).maybeSingle();
  if (!day) return { error: "Deň sa nenašiel." };

  const current = (Array.isArray(day.exercises) ? day.exercises : []) as WorkoutExerciseEntry[];
  const updated = current.map((entry) =>
    entry.entry_id === entryId
      ? {
          ...entry,
          sets,
          reps,
          load_kg: loadRaw ? Number(loadRaw) : null,
          tempo,
          rest_seconds: restRaw ? Number(restRaw) : null,
        }
      : entry
  );

  const { error } = await supabase.from("workout_days").update({ exercises: updated }).eq("id", dayId);
  if (error) return { error: error.message };

  revalidatePath(`/dashboard/treningy/${planId}`);
  return ok;
}

export async function removeExerciseEntryAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();

  const dayId = formData.get("day_id") as string | null;
  const planId = formData.get("plan_id") as string | null;
  const entryId = formData.get("entry_id") as string | null;

  if (!dayId || !planId || !entryId) return { error: "Chýba identifikátor záznamu." };

  const { data: day } = await supabase.from("workout_days").select("exercises").eq("id", dayId).maybeSingle();
  if (!day) return { error: "Deň sa nenašiel." };

  const current = (Array.isArray(day.exercises) ? day.exercises : []) as WorkoutExerciseEntry[];
  const updated = current.filter((entry) => entry.entry_id !== entryId);

  const { error } = await supabase.from("workout_days").update({ exercises: updated }).eq("id", dayId);
  if (error) return { error: error.message };

  revalidatePath(`/dashboard/treningy/${planId}`);
  return ok;
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
  return ok;
}
