"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { addPlanRecipients, areTrainerClients, deliverPlanToRecipients, MAX_PLAN_CLIENTS, uniqueClientIds } from "@/lib/planRecipients";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { displayExerciseName, fetchExerciseDetail, type ExerciseDetail } from "@/lib/exercises";
import { generateWorkoutPlan, type GeneratedPlan, type PlanGoal, type PlanExperience, type PlanEquipment } from "@/lib/ai/planGenerator";
import { PLAN_FOCUSES, isSingleDayFocus, type PlanFocus } from "@/lib/ai/planCategories";
import { defaultFocusForSex, planClientContextLines } from "@/lib/ai/planClientContext";
import { getTrainingHistoryLines } from "@/lib/ai/trainingHistoryContext";
import type { ActivityLevel, Goal } from "@/lib/nutrition";
import { reserveAiSlot, AI_PLAN_GEN_DAILY_LIMIT } from "@/lib/ai/rateLimit";
import { AI_MODEL } from "@/lib/ai/client";
import { PLAN_GOALS, PLAN_GOAL_LABEL_SK } from "@/lib/planGoals";
import { dbErr } from "@/lib/dbError";
import { parsePlanSnapshot, snapshotToPlanEntries } from "@/lib/workouts/completed";
import { getDayForEdit, isPlanLocked } from "@/lib/dashboard/planCompletion";
import { tErr } from "@/lib/i18n/serverErrors";
import { getTrainerExerciseLibrary } from "@/lib/exerciseLibrary";

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
  // rovnaká cache globálnej knižnice ako builder (lib/exerciseLibrary)
  const rows = await getTrainerExerciseLibrary(supabase);
  return rows.map((e) => ({ id: e.id, name: e.name, muscleGroup: e.muscle_group }));
}

export interface WorkoutExerciseEntry {
  entry_id: string;
  /** `null` = vlastný cvik pridaný rovno do tréningu, nie je v knižnici (žiadny detail/obrázky). */
  exercise_id: string | null;
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

  const clientIds = uniqueClientIds(formData.getAll("client_id"));
  const name = (formData.get("name") as string | null)?.trim() ?? "";

  if (clientIds.length === 0) return { error: "Vyber klienta." };
  if (clientIds.length > MAX_PLAN_CLIENTS) return { error: `Naraz najviac ${MAX_PLAN_CLIENTS} klientov.` };
  if (!name) return { error: "Zadaj názov plánu." };

  // Viacerí klienti → JEDEN koncept pre prvého, ostatní sú jeho príjemcovia (0052) —
  // po odoslaní dostane každý vlastnú kópiu (lib/planRecipients), rovnako ako šablóny.
  const [clientId, ...others] = clientIds;
  if (!(await areTrainerClients(supabase, user.id, others))) return { error: "Niektorý z vybraných klientov nepatrí tebe." };

  const { data, error } = await supabase
    .from("workout_plans")
    // Nový plán je koncept (published: false), kým ho tréner výslovne nepotvrdí
    // tlačidlom "Potvrdiť a uložiť" — dovtedy ho klient v portáli nevidí.
    .insert({ client_id: clientId, trainer_id: user.id, name, published: false })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Plán sa nepodarilo vytvoriť." };

  const recipientsError = await addPlanRecipients(supabase, user.id, "workout", data.id, others);
  if (recipientsError) {
    // bez príjemcov by koncept dostal len prvý klient — radšej nič a jasná chyba
    await supabase.from("workout_plans").delete().eq("id", data.id);
    return { error: `Ďalších klientov sa nepodarilo pridať: ${recipientsError}` };
  }

  revalidatePath("/dashboard/treningy");
  redirect(`/dashboard/treningy/${data.id}`);
}

/**
 * Premenovanie plánu (ceruzka pri názve na detaile plánu). Nový názov vidí aj
 * klient v portáli; šablóna sa odteraz ukladá pod týmto názvom. RLS
 * workout_plans_update_own_trainer — cudzí plán vráti 0 riadkov, nie chybu.
 */
export async function renamePlanAction(planId: string, rawName: string): Promise<ActionState> {
  if (!planId) return { error: "Chýba ID plánu." };
  const name = rawName.trim();
  if (!name) return { error: "Zadaj názov plánu." };
  if (name.length > 120) return { error: "Názov môže mať najviac 120 znakov." };

  // zámok aj session naraz (predtým za sebou)
  const supabase = await createClient();
  const [locked, { data: { user } }] = await Promise.all([isPlanLocked(supabase, planId), supabase.auth.getUser()]);
  if (locked) return { error: await tErr("planLocked") };
  if (!user) return { error: "Nie si prihlásený." };

  const { data, error } = await supabase
    .from("workout_plans")
    .update({ name })
    .eq("id", planId)
    .eq("trainer_id", user.id)
    .select("client_id");
  if (error) return { error: await dbErr(error, "actions") };
  if (!data || data.length === 0) return { error: "Plán sa nepodarilo premenovať — skús obnoviť stránku." };

  revalidatePath(`/dashboard/treningy/${planId}`);
  revalidatePath("/dashboard/treningy");
  revalidatePath(`/dashboard/klienti/${data[0].client_id}`);
  return ok;
}

/** Potvrdenie/koncept plánu — kým je `published: false`, klient ho v portáli nevidí. */
export async function setPlanPublishedAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const planId = formData.get("plan_id") as string | null;
  const published = formData.get("published") === "true";
  if (!planId) return { error: "Chýba ID plánu." };

  const [locked, { data: { user } }] = await Promise.all([isPlanLocked(supabase, planId), supabase.auth.getUser()]);
  if (!user) return { error: "Nie si prihlásený." };
  if (locked) return { error: await tErr("planLocked") };

  const { error } = await supabase
    .from("workout_plans")
    .update({ published })
    .eq("id", planId)
    .eq("trainer_id", user.id);

  if (error) return { error: await dbErr(error, "actions") };

  // šablóna pre viacerých klientov (0052): každý ďalší príjemca dostane vlastnú kópiu
  const delivery = published ? await deliverPlanToRecipients(supabase, user.id, "workout", planId) : null;

  revalidatePath(`/dashboard/treningy/${planId}`);
  revalidatePath("/dashboard/treningy");
  if (delivery?.error) return { error: delivery.error };
  return ok;
}

export async function addDayAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const planId = formData.get("plan_id") as string | null;
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const dayNumber = Number(formData.get("day_number"));

  if (!planId) return { error: "Chýba ID plánu." };
  if (!name) return { error: "Zadaj názov dňa." };
  if (await isPlanLocked(supabase, planId)) return { error: await tErr("planLocked") };

  const { error } = await supabase.from("workout_days").insert({
    plan_id: planId,
    day_number: Number.isFinite(dayNumber) ? dayNumber : 1,
    name,
    exercises: [],
  });

  if (error) return { error: await dbErr(error, "actions") };

  revalidatePath(`/dashboard/treningy/${planId}`);
  return ok;
}

/**
 * "Zmazať deň" v builderi (po potvrdení v DeleteDayControl). Odcvičené tréningy
 * z tohto dňa ostanú — workout_logs.workout_day_id sa cez FK nastaví na null a
 * záznam si drží vlastnú kópiu plánu (plan_snapshot, 0048). Zvyšné dni sa
 * prečíslujú 1..n v pôvodnom poradí: "+ deň" berie ďalšie číslo ako počet dní,
 * takže medzera by viedla k dvom dňom s rovnakým day_number (nejasné poradie
 * v builderi aj v rotácii portálu).
 */
export async function deleteDayAction(planId: string, dayId: string): Promise<ActionState> {
  if (!planId || !dayId) return { error: "Chýba identifikátor dňa." };

  const supabase = await createClient();
  const [locked, { data: { user } }] = await Promise.all([
    isPlanLocked(supabase, planId, dayId),
    supabase.auth.getUser(),
  ]);
  if (locked) return { error: await tErr("planLocked") };
  if (!user) return { error: "Nie si prihlásený." };

  // RLS workout_days_delete_own_trainer — cudzí deň vráti 0 riadkov, nie chybu.
  const { data: deleted, error } = await supabase
    .from("workout_days")
    .delete()
    .eq("id", dayId)
    .eq("plan_id", planId)
    .select("id");
  if (error) return { error: await dbErr(error, "actions") };
  if (!deleted || deleted.length === 0) return { error: "Deň sa nepodarilo zmazať — skús obnoviť stránku." };

  const { data: rest } = await supabase
    .from("workout_days")
    .select("id, day_number")
    .eq("plan_id", planId)
    .order("day_number")
    .order("created_at");
  await Promise.all(
    (rest ?? [])
      .map((d, i) => ({ id: d.id as string, from: d.day_number as number, to: i + 1 }))
      .filter((d) => d.from !== d.to)
      .map((d) => supabase.from("workout_days").update({ day_number: d.to }).eq("id", d.id)),
  );

  revalidatePath(`/dashboard/treningy/${planId}`);
  revalidatePath("/dashboard/treningy");
  return ok;
}

/**
 * "Premenovať" deň v builderi (rovnako ako v jedálničku). Nový názov vidí aj klient
 * (pilulky dní v portáli); odcvičené tréningy si držia pôvodný názov v plan_snapshot (0048).
 */
export async function renameDayAction(planId: string, dayId: string, rawName: string): Promise<ActionState> {
  if (!planId || !dayId) return { error: "Chýba identifikátor dňa." };
  const name = rawName.trim();
  if (!name) return { error: "Zadaj názov dňa." };
  if (name.length > 120) return { error: "Názov dňa môže mať najviac 120 znakov." };

  const supabase = await createClient();
  if (await isPlanLocked(supabase, planId, dayId)) return { error: await tErr("planLocked") };

  // RLS workout_days_update_own_trainer — cudzí deň vráti 0 riadkov, nie chybu.
  const { data, error } = await supabase
    .from("workout_days")
    .update({ name })
    .eq("id", dayId)
    .eq("plan_id", planId)
    .select("id");
  if (error) return { error: await dbErr(error, "actions") };
  if (!data || data.length === 0) return { error: "Deň sa nepodarilo premenovať — skús obnoviť stránku." };

  revalidatePath(`/dashboard/treningy/${planId}`);
  return ok;
}

/**
 * "Duplikovať" v builderi (rovnako ako v jedálničku) — kópia dňa aj s cvikmi (nové entry_id)
 * na koniec plánu, názov „… (kópia)“. Vráti ID nového dňa, builder sa naň prepne.
 * Uzamknutý (celý odcvičený) plán sa nemení; RLS — cudzí deň/plán sa nenájde.
 */
export async function duplicateDayAction(planId: string, dayId: string): Promise<{ error: string | null; dayId: string | null }> {
  const fail = (error: string) => ({ error, dayId: null });
  if (!planId || !dayId) return fail("Chýba identifikátor dňa.");

  const supabase = await createClient();
  const [locked, { data: src }, { count }] = await Promise.all([
    isPlanLocked(supabase, planId),
    supabase.from("workout_days").select("name, exercises").eq("id", dayId).eq("plan_id", planId).maybeSingle(),
    supabase.from("workout_days").select("id", { count: "exact", head: true }).eq("plan_id", planId),
  ]);
  if (locked) return fail(await tErr("planLocked"));
  if (!src) return fail("Deň sa nenašiel — skús obnoviť stránku.");

  const exercises = (Array.isArray(src.exercises) ? (src.exercises as WorkoutExerciseEntry[]) : []).map((e) => ({
    ...e,
    entry_id: randomUUID(),
  }));
  const { data, error } = await supabase
    .from("workout_days")
    // dni sú po zmazaní prečíslované 1..n (deleteDayAction) → kópia ide za posledný
    .insert({ plan_id: planId, day_number: (count ?? 0) + 1, name: `${src.name} (kópia)`.slice(0, 120), exercises })
    .select("id")
    .single();
  if (error || !data) return fail(error ? await dbErr(error, "actions") : "Deň sa nepodarilo skopírovať.");

  revalidatePath(`/dashboard/treningy/${planId}`);
  revalidatePath("/dashboard/treningy");
  return { error: null, dayId: data.id };
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

  // Deň + zámok (jeden dopyt) a cvik naraz — predtým 5 dopytov za sebou pred zápisom.
  const [{ day, locked }, { data: exercise }] = await Promise.all([
    getDayForEdit(supabase, dayId),
    supabase.from("exercises").select("name, name_sk").eq("id", exerciseId).maybeSingle(),
  ]);
  if (locked) return { error: await tErr("planLocked") };
  if (!exercise) return { error: "Cvik sa nenašiel." };
  if (!day) return { error: "Deň sa nenašiel." };

  const newEntry: WorkoutExerciseEntry = {
    entry_id: randomUUID(),
    exercise_id: exerciseId,
    // Rovnaký názov, aký tréner vidí v knižnici (AI generátor aj ClientPlanBuilder
    // ukladajú tiež name_sk) — inak plán, portál aj analytika ukazovali anglicky.
    exercise_name: displayExerciseName(exercise.name, exercise.name_sk),
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

  if (error) return { error: await dbErr(error, "actions") };

  revalidatePath(`/dashboard/treningy/${planId}`);
  return ok;
}

/**
 * "Pridať do tréningu" pri vlastnom cviku v builderi — pridá cvik LEN do aktívneho
 * dňa práve zostavovaného plánu, bez zápisu do knižnice (tú napĺňa výhradne
 * `addCustomExerciseAction`). Entry má `exercise_id: null` — rovnaký tvar ako
 * vlastný cvik klienta v jeho portálovom builderi (app/portal/trening/actions.ts),
 * takže detail/obrázky sa preň jednoducho neponúkajú.
 */
export async function addCustomExerciseToDayAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();

  const dayId = formData.get("day_id") as string | null;
  const planId = formData.get("plan_id") as string | null;
  const name = (formData.get("name") as string | null)?.trim() ?? "";

  if (!dayId) return { error: "Najprv pridaj tréningový deň." };
  if (!planId) return { error: "Chýba ID plánu." };
  if (!name) return { error: "Zadaj názov cviku." };

  const { day, locked } = await getDayForEdit(supabase, dayId);
  if (locked) return { error: await tErr("planLocked") };
  if (!day) return { error: "Deň sa nenašiel." };

  const newEntry: WorkoutExerciseEntry = {
    entry_id: randomUUID(),
    exercise_id: null,
    exercise_name: name,
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

  if (error) return { error: await dbErr(error, "actions") };

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

  const { day, locked } = await getDayForEdit(supabase, dayId);
  if (locked) return { error: await tErr("planLocked") };
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
  if (error) return { error: await dbErr(error, "actions") };

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
  const { day, locked } = await getDayForEdit(supabase, dayId);
  if (locked) return { error: await tErr("planLocked") };
  if (!day) return { error: "Deň sa nenašiel." };

  const current = (Array.isArray(day.exercises) ? day.exercises : []) as WorkoutExerciseEntry[];
  const idx = current.findIndex((e) => e.entry_id === entryId);
  if (idx < 0) return { error: "Cvik sa nenašiel." };

  const target = direction === "up" ? idx - 1 : idx + 1;
  if (target < 0 || target >= current.length) return ok; // už na kraji — nič nemeníme

  const updated = [...current];
  [updated[idx], updated[target]] = [updated[target], updated[idx]];

  const { error } = await supabase.from("workout_days").update({ exercises: updated }).eq("id", dayId);
  if (error) return { error: await dbErr(error, "actions") };

  revalidatePath(`/dashboard/treningy/${planId}`);
  return ok;
}

export async function removeExerciseEntryAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();

  const dayId = formData.get("day_id") as string | null;
  const planId = formData.get("plan_id") as string | null;
  const entryId = formData.get("entry_id") as string | null;

  if (!dayId || !planId || !entryId) return { error: "Chýba identifikátor záznamu." };

  const { day, locked } = await getDayForEdit(supabase, dayId);
  if (locked) return { error: await tErr("planLocked") };
  if (!day) return { error: "Deň sa nenašiel." };

  const current = (Array.isArray(day.exercises) ? day.exercises : []) as WorkoutExerciseEntry[];
  const updated = current.filter((entry) => entry.entry_id !== entryId);

  const { error } = await supabase.from("workout_days").update({ exercises: updated }).eq("id", dayId);
  if (error) return { error: await dbErr(error, "actions") };

  revalidatePath(`/dashboard/treningy/${planId}`);
  return ok;
}

/**
 * Zmazanie plánu — koncept ("Zmazať koncept" hore) aj už publikovaný plán
 * ("Zmazať" dole pri PDF). `workout_days` idú kaskádou (FK `on delete cascade`,
 * 0002); odcvičené tréningy ostanú: `workout_logs.workout_day_id` sa nastaví na
 * null a záznam si drží vlastnú kópiu plánu (plan_snapshot, 0048 — zámok túto
 * zmenu povoľuje). `clients.active_plan_id`/`active_day_id` sa cez FK vynulujú,
 * portál klienta potom spadne na najnovší zostávajúci plán.
 */
export async function deletePlanAction(planId: string): Promise<ActionState> {
  if (!planId) return { error: "Chýba ID plánu." };

  const supabase = await createClient();
  const [locked, { data: { user } }] = await Promise.all([isPlanLocked(supabase, planId), supabase.auth.getUser()]);
  if (locked) return { error: await tErr("planLocked") };
  if (!user) return { error: "Nie si prihlásený." };

  const { data: deleted, error } = await supabase
    .from("workout_plans")
    .delete()
    .eq("id", planId)
    .eq("trainer_id", user.id)
    .select("client_id");
  if (error) return { error: await dbErr(error, "actions") };
  if (!deleted || deleted.length === 0) return { error: "Plán sa nenašiel." };

  revalidatePath("/dashboard/treningy");
  revalidatePath(`/dashboard/klienti/${deleted[0].client_id}`);
  redirect("/dashboard/treningy");
}

/**
 * "Duplikovať ako nový tréning" — z dokončeného tréningu (workout_logs, 0048)
 * vytvorí nový plán ako koncept s jedným dňom: plánované cviky zo snapshotu v
 * čase tréningu, bez výsledkov klienta. Pôvodný záznam ostáva nedotknutý (je
 * zamknutý v DB), tréner upravuje len novú kópiu. Nový plán je `published: false`,
 * klient ho uvidí až po potvrdení — rovnako ako pri createPlanAction.
 */
export async function duplicateCompletedWorkoutAction(logId: string): Promise<ActionState> {
  if (!logId) return { error: "Chýba ID tréningu." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  // RLS workout_logs_select_own_trainer — tréner vidí len záznamy vlastných klientov.
  const { data: log, error: logErr } = await supabase
    .from("workout_logs")
    .select("id, client_id, status, plan_snapshot")
    .eq("id", logId)
    .maybeSingle();
  if (logErr) return { error: await dbErr(logErr, "actions") };
  if (!log) return { error: "Tréning sa nenašiel." };
  if (log.status !== "completed") return { error: "Duplikovať sa dá len dokončený tréning." };

  const snapshot = parsePlanSnapshot(log.plan_snapshot);
  if (!snapshot || snapshot.exercises.length === 0) {
    return { error: "Tréning nemá uložený plán, z ktorého by sa dala urobiť kópia." };
  }

  const dayName = snapshot.dayName ?? "Tréning";
  const { data: plan, error: planErr } = await supabase
    .from("workout_plans")
    .insert({ client_id: log.client_id, trainer_id: user.id, name: `${dayName} (kópia)`, published: false })
    .select("id")
    .single();
  if (planErr || !plan) return { error: await dbErr(planErr, "actions") };

  const { error: dayErr } = await supabase.from("workout_days").insert({
    plan_id: plan.id,
    day_number: 1,
    name: dayName,
    exercises: snapshotToPlanEntries(snapshot, randomUUID),
  });
  if (dayErr) {
    // Bez dňa by ostal prázdny koncept — radšej ho zahoď (koncept bez logov sa zmazať dá).
    await supabase.from("workout_plans").delete().eq("id", plan.id);
    return { error: await dbErr(dayErr, "actions") };
  }

  revalidatePath("/dashboard/treningy");
  revalidatePath(`/dashboard/klienti/${log.client_id}`);
  redirect(`/dashboard/treningy/${plan.id}`);
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

  if (error) return { error: await dbErr(error, "actions") };

  revalidatePath("/dashboard/treningy");
  return ok;
}

const PLAN_EXPERIENCES: PlanExperience[] = ["zaciatocnik", "stredne_pokrocily", "pokrocily"];
const PLAN_EQUIPMENT: PlanEquipment[] = ["plna_posilnovna", "domace_vybavenie", "len_telo"];

/** Vstupy AI generátora z formulára — rovnaké pre všetkých vybraných klientov. */
export interface AiPlanParams {
  goal: string;
  experience: string;
  equipment: string;
  /** zameranie, alebo „auto“ = podľa pohlavia každého klienta (výber viacerých klientov) */
  focus: string;
  daysPerWeek: number | null;
}

interface ValidAiPlanParams {
  goal: PlanGoal;
  experience: PlanExperience;
  equipment: PlanEquipment;
  focus: PlanFocus | "auto";
  daysPerWeek: number;
}

function parseAiPlanParams(raw: AiPlanParams): ValidAiPlanParams | { error: string } {
  // Zameranie je voliteľné — chýbajúce / neznáme = "vyvážene" (bezpečný fallback).
  const focus: PlanFocus | "auto" =
    raw.focus === "auto" ? "auto" : PLAN_FOCUSES.includes(raw.focus as PlanFocus) ? (raw.focus as PlanFocus) : "vyvazene";
  // Partiové (jednodňové) zameranie ignoruje počet dní — UI ho skryje, appka vygeneruje presne 1 deň.
  const singleDay = focus !== "auto" && isSingleDayFocus(focus);
  const daysPerWeek = singleDay ? 1 : Number(raw.daysPerWeek);

  if (!raw.goal || !PLAN_GOALS.includes(raw.goal as PlanGoal)) return { error: "Vyber cieľ." };
  if (!raw.experience || !PLAN_EXPERIENCES.includes(raw.experience as PlanExperience)) return { error: "Vyber skúsenosť klienta." };
  if (!raw.equipment || !PLAN_EQUIPMENT.includes(raw.equipment as PlanEquipment)) return { error: "Vyber dostupné vybavenie." };
  if (!singleDay && (!Number.isFinite(daysPerWeek) || daysPerWeek < 1 || daysPerWeek > 7)) {
    return { error: "Zadaj počet dní 1-7." };
  }
  return {
    goal: raw.goal as PlanGoal,
    experience: raw.experience as PlanExperience,
    equipment: raw.equipment as PlanEquipment,
    focus,
    daysPerWeek,
  };
}

const firstRow = <T,>(raw: T | T[] | null): T | null => (Array.isArray(raw) ? (raw[0] ?? null) : raw);

/**
 * Jeden AI plán pre jedného klienta — vytvorí bežný koncept (`published: false`, presne
 * ako ručne vytvorený plán, 0021). Model dostane aj údaje klienta (lib/ai/planClientContext),
 * takže pri výbere viacerých klientov je každý plán prispôsobený svojmu klientovi.
 */
async function generateAiPlanForClient(
  supabase: Awaited<ReturnType<typeof createClient>>,
  trainerId: string,
  params: ValidAiPlanParams,
  clientId: string,
): Promise<{ error: string } | { planId: string; warnings: string[] }> {
  const [{ data: client }, { data: privateNote }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, goal, age, weight_kg, height_cm, nutrition_profiles(sex, age, weight_kg, height_cm, activity_level, goal)")
      .eq("id", clientId)
      .eq("trainer_id", trainerId)
      .maybeSingle(),
    // Súkromná poznámka trénera (0036) — obmedzenia/zranenia; klient ju nevidí.
    supabase.from("trainer_private_notes").select("notes").eq("client_id", clientId).eq("scope", "client").maybeSingle(),
  ]);
  if (!client) return { error: "Klient sa nenašiel." };

  // nutrition_profiles.client_id je unique → PostgREST vráti objekt (ošetrené aj pole)
  const profile = firstRow(
    client.nutrition_profiles as unknown as {
      sex: "muz" | "zena";
      age: number;
      weight_kg: number;
      height_cm: number;
      activity_level: ActivityLevel;
      goal: Goal;
    } | null,
  );
  const focus: PlanFocus = params.focus === "auto" ? defaultFocusForSex(profile?.sex ?? null) : params.focus;
  const singleDay = isSingleDayFocus(focus);

  const fixture = await devAiPlanFixture(supabase, clientId, focus);
  if (fixture) return fixture.error ? { error: fixture.error } : insertAiPlan(supabase, trainerId, clientId, params, fixture.plan!);

  // Atomická rezervácia PRED volaním modelu — nulové náklady pri zamietnutí a paralelné
  // požiadavky ju neobídu (lib/ai/rateLimit.ts, migrácia 0036). Per tréner, nie per
  // klient — inak by sa dal limit obísť striedaním klientov.
  const slot = await reserveAiSlot({
    supabase,
    kind: "plan_gen",
    trainerId,
    clientId,
    model: AI_MODEL.PLAN_GENERATOR,
    subject: "trainer",
    subjectLimit: AI_PLAN_GEN_DAILY_LIMIT(),
  });
  if (!slot.allowed) {
    return { error: `Dosiahol/a si dnešný limit AI generovania plánov (${AI_PLAN_GEN_DAILY_LIMIT()}). Skús to zajtra.` };
  }

  const result = await generateWorkoutPlan(supabase, {
    trainerId,
    clientId,
    goal: params.goal,
    daysPerWeek: singleDay ? 1 : params.daysPerWeek,
    experience: params.experience,
    equipment: params.equipment,
    focus,
    reservationId: slot.reservationId,
    clientContext: [
      ...planClientContextLines({
        goal: client.goal,
        sex: profile?.sex ?? null,
        age: profile?.age ?? client.age,
        weightKg: profile?.weight_kg ?? client.weight_kg,
        heightCm: profile?.height_cm ?? client.height_cm,
        activityLevel: profile?.activity_level ?? null,
        nutritionGoal: profile?.goal ?? null,
        trainerNote: privateNote?.notes ?? null,
      }),
      // feature/AIupgrade: plán sa doteraz generoval "od nuly" bez ohľadu na to,
      // čo klient už reálne odcvičil — pridáva nedávne cviky/váhy a stagnáciu,
      // nech nový koncept stavia na progrese, nie na náhodnom resete.
      ...(await getTrainingHistoryLines(clientId)),
    ],
  });
  if ("error" in result) return { error: result.error };
  return insertAiPlan(supabase, trainerId, clientId, params, result.plan);
}

/** Vygenerovaný návrh → koncept plánu (workout_plans + workout_days). */
async function insertAiPlan(
  supabase: Awaited<ReturnType<typeof createClient>>,
  trainerId: string,
  clientId: string,
  params: ValidAiPlanParams,
  plan: GeneratedPlan,
): Promise<{ error: string } | { planId: string; warnings: string[] }> {
  // Partiové (jednodňové) generovanie pomenuje plán podľa kategórie + dátumu
  // (napr. "Chrbát — 18. 9. 2026"), inak default podľa cieľa ako doteraz.
  const planName = plan.planName ?? `AI plán — ${PLAN_GOAL_LABEL_SK[params.goal]}`;

  const { data: newPlan, error: planErr } = await supabase
    .from("workout_plans")
    .insert({
      client_id: clientId,
      trainer_id: trainerId,
      name: planName,
      published: false,
    })
    .select("id")
    .single();
  if (planErr || !newPlan) return { error: planErr?.message ?? "Plán sa nepodarilo vytvoriť." };

  const dayRows = plan.days.map((day, i) => ({
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
  if (daysErr) {
    // prázdny koncept bez dní by v zozname len mätol
    await supabase.from("workout_plans").delete().eq("id", newPlan.id);
    return { error: await dbErr(daysErr, "actions") };
  }
  return { planId: newPlan.id, warnings: plan.warnings ?? [] };
}

/**
 * DEV seam pre e2e (e2e/treningy-multi-klient.spec.ts) — hlavička `x-e2e-ai-fixture` nahradí
 * volanie modelu deterministickým návrhom z prvých cvikov knižnice (bez AI limitu a kreditu);
 * `fail:<clientId>` simuluje zlyhanie pre jedného klienta. Zvyšok toku (údaje klienta,
 * zameranie, uloženie konceptu) beží naostro. Mimo `next dev` sa hlavička ignoruje.
 */
async function devAiPlanFixture(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string,
  focus: PlanFocus,
): Promise<{ error?: string; plan?: GeneratedPlan } | null> {
  if (process.env.NODE_ENV !== "development") return null;
  const raw = (await headers()).get("x-e2e-ai-fixture");
  if (!raw) return null;
  if (raw === `fail:${clientId}`) return { error: "Simulované zlyhanie AI (e2e)." };
  const { data: exercises } = await supabase.from("exercises").select("id, name").order("name").limit(3);
  return {
    plan: {
      planName: `E2E AI · ${focus}`,
      days: [
        {
          name: "Deň 1",
          exercises: (exercises ?? []).map((e) => ({ exerciseId: e.id, exerciseName: e.name, sets: 3, reps: "8-10", restSeconds: 90 })),
        },
      ],
    },
  };
}

/**
 * AI generátor plánu (Track "Tréner" bod 4/5, ROADMAP.md) — formulár pre JEDNÉHO klienta.
 * Vytvorí koncept a presmeruje do existujúceho PlanBuilderu na plnú editáciu pred
 * publikovaním — draft-then-approve bez potreby novej tabuľky. Viacerí klienti idú
 * z prehliadača po jednom cez generateAiPlanForClientAction (priebeh „Generujem 2/5…“).
 */
export async function generatePlanWithAiAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const clientId = formData.get("client_id") as string | null;
  if (!clientId) return { error: "Vyber klienta." };
  const params = parseAiPlanParams({
    goal: formData.get("goal") as string,
    experience: formData.get("experience") as string,
    equipment: formData.get("equipment") as string,
    focus: (formData.get("focus") as string | null) ?? "vyvazene",
    daysPerWeek: Number(formData.get("days_per_week")),
  });
  if ("error" in params) return { error: params.error };

  const generated = await generateAiPlanForClient(supabase, user.id, params, clientId);
  if ("error" in generated) return { error: generated.error };

  revalidatePath("/dashboard/treningy");

  // Keď deterministická kontrola zamerania nechala varovania, plán existuje, ale
  // rovno doň nepresmerujeme — tréner nech najprv uvidí, čo nebolo dotiahnuté,
  // a otvorí koncept sám (link vo formulári).
  if (generated.warnings.length > 0) {
    return { error: null, planId: generated.planId, warnings: generated.warnings };
  }

  redirect(`/dashboard/treningy/${generated.planId}`);
}

export interface AiPlanForClientResult {
  error: string | null;
  planId: string | null;
  warnings: string[];
}

/**
 * AI plán pre jedného z viacerých vybraných klientov — prehliadač volá postupne klienta
 * po klientovi (priebeh v UI, chyba jedného nezastaví ostatných). Bez presmerovania.
 */
export async function generateAiPlanForClientAction(raw: AiPlanParams, clientId: string): Promise<AiPlanForClientResult> {
  const fail = (error: string): AiPlanForClientResult => ({ error, planId: null, warnings: [] });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Nie si prihlásený.");
  if (!clientId) return fail("Vyber klienta.");
  const params = parseAiPlanParams(raw);
  if ("error" in params) return fail(params.error);

  const generated = await generateAiPlanForClient(supabase, user.id, params, clientId);
  if ("error" in generated) return fail(generated.error);
  revalidatePath("/dashboard/treningy");
  revalidatePath(`/dashboard/klienti/${clientId}`);
  return { error: null, planId: generated.planId, warnings: generated.warnings };
}
