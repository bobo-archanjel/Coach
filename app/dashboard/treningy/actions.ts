"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchExerciseDetail, type ExerciseDetail } from "@/lib/exercises";
import { generateWorkoutPlan, type PlanGoal, type PlanExperience, type PlanEquipment } from "@/lib/ai/planGenerator";
import { PLAN_FOCUSES, type PlanFocus } from "@/lib/ai/planTaxonomy";
import { isPlanGenRateLimited, AI_PLAN_GEN_DAILY_LIMIT } from "@/lib/ai/rateLimit";
import { PLAN_GOALS, PLAN_GOAL_LABEL_SK } from "@/lib/planGoals";

export interface ActionState {
  error: string | null;
  /** AI generátor: keď deterministická kontrola zamerania niečo nedotiahla, plán sa
   *  vytvorí, ale nepresmerujeme rovno doň — najprv ukážeme trénerovi varovania. */
  planId?: string | null;
  warnings?: string[];
}

const ok: ActionState = { error: null };

/** Detail cviku (obrázky + inštrukcie z Free Exercise DB) pre náhľadový modal v builderi. */
export async function getExerciseDetailAction(exerciseId: string): Promise<ExerciseDetail | null> {
  const supabase = await createClient();
  return fetchExerciseDetail(supabase, exerciseId);
}

export interface ExerciseListItem {
  id: string;
  name: string;
  muscleGroup: string | null;
}

/**
 * Celá knižnica cvikov (~900 riadkov) pre zoznam na /dashboard/treningy — predtým
 * sa ťahala a vypisovala na stránke vždy, teraz na požiadanie (ExerciseLibraryList,
 * defaultne zbalené, len počet v hlavičke sa počíta priamo pri načítaní stránky).
 */
export async function getExerciseLibraryListAction(): Promise<ExerciseListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("exercises").select("id, name, muscle_group").order("name");
  return (data ?? []).map((e) => ({ id: e.id, name: e.name, muscleGroup: e.muscle_group }));
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

/**
 * Presun cviku v poradí dňa o jednu pozíciu (hore/dole). Volá sa priamo (nie
 * cez `<form>`) z PlanBuilderu, ktorý si robí optimistický presun lokálne — táto
 * akcia len uloží nové poradie do `workout_days.exercises` (jsonb) a zreviduje.
 * Na okraji zoznamu je no-op (vráti `ok`, žiadny zápis). RLS
 * (`workout_days_update_own_trainer`) drží, že deň patrí prihlásenému trénerovi.
 */
export async function moveExerciseEntryAction(input: {
  planId: string;
  dayId: string;
  entryId: string;
  direction: "up" | "down";
}): Promise<ActionState> {
  const { planId, dayId, entryId, direction } = input;
  if (!planId || !dayId || !entryId) return { error: "Chýba identifikátor záznamu." };

  const supabase = await createClient();
  const { data: day } = await supabase.from("workout_days").select("exercises").eq("id", dayId).maybeSingle();
  if (!day) return { error: "Deň sa nenašiel." };

  const current = (Array.isArray(day.exercises) ? day.exercises : []) as WorkoutExerciseEntry[];
  const idx = current.findIndex((e) => e.entry_id === entryId);
  if (idx < 0) return { error: "Cvik sa nenašiel." };

  const target = direction === "up" ? idx - 1 : idx + 1;
  if (target < 0 || target >= current.length) return ok; // už na kraji — nič nemeníme

  const updated = [...current];
  [updated[idx], updated[target]] = [updated[target], updated[idx]];

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

/**
 * Zmazanie plánu — len kým je koncept (`published: false`). Publikovaný plán
 * klient vidí v portáli, môže mať naň naviazané `workout_logs` — ten sa takto
 * nezmaže (tréner ho musí najprv vrátiť do konceptu). `workout_days` idú kaskádou
 * (FK `on delete cascade`, 0002).
 */
export async function deletePlanAction(planId: string): Promise<ActionState> {
  if (!planId) return { error: "Chýba ID plánu." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const { data: plan } = await supabase
    .from("workout_plans")
    .select("id, published")
    .eq("id", planId)
    .eq("trainer_id", user.id)
    .maybeSingle();
  if (!plan) return { error: "Plán sa nenašiel." };
  if (plan.published) return { error: "Publikovaný plán sa takto nedá zmazať — najprv ho vráť do konceptu." };

  const { error } = await supabase.from("workout_plans").delete().eq("id", planId).eq("trainer_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/treningy");
  redirect("/dashboard/treningy");
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

const PLAN_EXPERIENCES: PlanExperience[] = ["zaciatocnik", "stredne_pokrocily", "pokrocily"];
const PLAN_EQUIPMENT: PlanEquipment[] = ["plna_posilnovna", "domace_vybavenie", "len_telo"];

/**
 * AI generátor plánu (Track "Tréner" bod 4/5, ROADMAP.md). Vytvorí bežný
 * koncept (`published: false`, presne ako ručne vytvorený plán, 0021) a
 * presmeruje do existujúceho PlanBuilderu na plnú editáciu pred publikovaním
 * — draft-then-approve bez potreby novej tabuľky.
 */
export async function generatePlanWithAiAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const clientId = formData.get("client_id") as string | null;
  const goal = formData.get("goal") as string | null;
  const experience = formData.get("experience") as string | null;
  const equipment = formData.get("equipment") as string | null;
  // Zameranie je voliteľné — chýbajúce / neznáme = "vyvážene" (bezpečný fallback).
  const focusRaw = (formData.get("focus") as string | null) ?? "vyvazene";
  const focus: PlanFocus = PLAN_FOCUSES.includes(focusRaw as PlanFocus) ? (focusRaw as PlanFocus) : "vyvazene";
  const daysPerWeek = Number(formData.get("days_per_week"));

  if (!clientId) return { error: "Vyber klienta." };
  if (!goal || !PLAN_GOALS.includes(goal as PlanGoal)) return { error: "Vyber cieľ." };
  if (!experience || !PLAN_EXPERIENCES.includes(experience as PlanExperience)) return { error: "Vyber skúsenosť klienta." };
  if (!equipment || !PLAN_EQUIPMENT.includes(equipment as PlanEquipment)) return { error: "Vyber dostupné vybavenie." };
  if (!Number.isFinite(daysPerWeek) || daysPerWeek < 1 || daysPerWeek > 7) return { error: "Zadaj počet dní 1-7." };

  const { data: client } = await supabase
    .from("clients")
    .select("id, full_name")
    .eq("id", clientId)
    .eq("trainer_id", user.id)
    .maybeSingle();
  if (!client) return { error: "Klient sa nenašiel." };

  // Kontrola PRED volaním modelu — nulové náklady pri zamietnutí (rovnaký princíp
  // ako chat/progress summary, lib/ai/rateLimit.ts). Per tréner, nie per klient —
  // inak by sa dal limit obísť striedaním klientov.
  if (await isPlanGenRateLimited(supabase, user.id)) {
    return { error: `Dosiahol/a si dnešný limit AI generovania plánov (${AI_PLAN_GEN_DAILY_LIMIT()}). Skús to zajtra.` };
  }

  const result = await generateWorkoutPlan(supabase, {
    trainerId: user.id,
    clientId,
    goal: goal as PlanGoal,
    daysPerWeek,
    experience: experience as PlanExperience,
    equipment: equipment as PlanEquipment,
    focus,
  });
  if ("error" in result) return { error: result.error };

  const { data: newPlan, error: planErr } = await supabase
    .from("workout_plans")
    .insert({
      client_id: clientId,
      trainer_id: user.id,
      name: `AI plán — ${PLAN_GOAL_LABEL_SK[goal as PlanGoal]}`,
      published: false,
    })
    .select("id")
    .single();
  if (planErr || !newPlan) return { error: planErr?.message ?? "Plán sa nepodarilo vytvoriť." };

  const dayRows = result.plan.days.map((day, i) => ({
    plan_id: newPlan.id,
    day_number: i + 1,
    name: day.name,
    exercises: day.exercises.map((ex) => ({
      entry_id: randomUUID(),
      exercise_id: ex.exerciseId,
      exercise_name: ex.exerciseName,
      sets: ex.sets,
      reps: ex.reps,
      load_kg: null,
      tempo: null,
      rest_seconds: ex.restSeconds,
    })) satisfies WorkoutExerciseEntry[],
  }));

  const { error: daysErr } = await supabase.from("workout_days").insert(dayRows);
  if (daysErr) return { error: daysErr.message };

  revalidatePath("/dashboard/treningy");

  // Keď deterministická kontrola zamerania nechala varovania, plán existuje, ale
  // rovno doň nepresmerujeme — tréner nech najprv uvidí, čo nebolo dotiahnuté,
  // a otvorí koncept sám (link vo formulári).
  if (result.plan.warnings && result.plan.warnings.length > 0) {
    return { error: null, planId: newPlan.id, warnings: result.plan.warnings };
  }

  redirect(`/dashboard/treningy/${newPlan.id}`);
}
