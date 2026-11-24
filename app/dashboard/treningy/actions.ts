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
import { PLAN_GOALS } from "@/lib/planGoals";
import { dbErr } from "@/lib/dbError";
import { getDayForEdit, isPlanLocked } from "@/lib/dashboard/planCompletion";
import { tErr } from "@/lib/i18n/serverErrors";
import { getPlanReview } from "@/lib/portal/planReviewData";
import { PROGRESSION_OPTIONS, progressLoad } from "@/lib/portal/planReview";
import { getTranslations } from "next-intl/server";
import { EXERCISE_NOTE_MAX } from "@/lib/workouts/exerciseNote";
import { clampInt, optionalNum } from "@/lib/workouts/clamp";
import { nextEntryDefaults } from "@/lib/workouts/nextEntryDefaults";
import { detachFromSuperset, normalizeSupersets, toggleLinkWithNext } from "@/lib/workouts/superset";

export interface ActionState {
  error: string | null;
  /** AI generátor: keď deterministická kontrola zamerania niečo nedotiahla, plán sa
   *  vytvorí, ale nepresmerujeme rovno doň — najprv ukážeme trénerovi varovania. */
  planId?: string | null;
  warnings?: string[];
  /** pridanie cviku do dňa: ID nového cviku — builder ho hneď otvorí na úpravu */
  entryId?: string | null;
}

const ok: ActionState = { error: null };

/** Detail cviku (obrázky + inštrukcie z Free Exercise DB) pre náhľadový modal v builderi. */
export async function getExerciseDetailAction(exerciseId: string): Promise<ExerciseDetail | null> {
  const supabase = await createClient();
  return fetchExerciseDetail(supabase, exerciseId);
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
  /** superséria — rovnaké id u cvikov po sebe (lib/workouts/superset.ts); chýba = samostatný */
  superset?: string | null;
}

export async function createPlanAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: await tErr("notSignedIn") };

  const clientIds = uniqueClientIds(formData.getAll("client_id"));
  const name = (formData.get("name") as string | null)?.trim() ?? "";

  if (clientIds.length === 0) return { error: await tErr("chooseClient") };
  if (clientIds.length > MAX_PLAN_CLIENTS) return { error: `Naraz najviac ${MAX_PLAN_CLIENTS} klientov.` };
  if (!name) return { error: await tErr("plans.planNameRequired") };

  // Viacerí klienti → JEDEN koncept pre prvého, ostatní sú jeho príjemcovia (0052) —
  // po odoslaní dostane každý vlastnú kópiu (lib/planRecipients), rovnako ako šablóny.
  const [clientId, ...others] = clientIds;
  if (!(await areTrainerClients(supabase, user.id, others))) return { error: await tErr("plans.someSelectedNotYours") };

  const { data, error } = await supabase
    .from("workout_plans")
    // Nový plán je koncept (published: false), kým ho tréner výslovne nepotvrdí
    // tlačidlom "Potvrdiť a uložiť" — dovtedy ho klient v portáli nevidí.
    .insert({ client_id: clientId, trainer_id: user.id, name, published: false })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? await tErr("plans.createPlanFailed") };

  // Nový plán má hneď prvý deň („Deň 1“) — tréner môže rovno pridávať cviky. Keby vloženie
  // zlyhalo, plán ostane bez dní (deň sa dá pridať cez „+ deň“), preto chyba nie je fatálna.
  const tb = await getTranslations("plans.builder");
  await supabase.from("workout_days").insert({ plan_id: data.id, day_number: 1, name: tb("defaultDayName", { n: 1 }), exercises: [] });

  const recipientsError = await addPlanRecipients(supabase, user.id, "workout", data.id, others);
  if (recipientsError) {
    // bez príjemcov by koncept dostal len prvý klient — radšej nič a jasná chyba
    await supabase.from("workout_plans").delete().eq("id", data.id);
    return { error: await tErr("plans.recipientsFailed", { details: recipientsError }) };
  }

  revalidatePath("/dashboard/treningy");
  redirect(`/dashboard/treningy/${data.id}`);
}

/**
 * „Zopakovať s progresiou“ na hotovom pláne (detail plánu trénera): nový KONCEPT plánu pre
 * toho istého klienta — rovnaké dni a cviky (nové entry_id, superséria ostáva), záťaž +pct %
 * pri cvikoch, kde klient pri poslednom tréningu splnil všetky série (getPlanReview → `ready`,
 * rovnaký výpočet ako vyhodnotenie). Tréner ho potom upraví a odošle ako každý koncept.
 */
export async function createProgressedPlanAction(planId: string, pct: number): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: await tErr("notSignedIn") };
  if (!(PROGRESSION_OPTIONS as readonly number[]).includes(pct)) return { error: await tErr("planNotFound") };

  // RLS: cudzí plán sa nenájde
  const { data: plan } = await supabase
    .from("workout_plans")
    .select("id, name, client_id, trainer_id, workout_days(day_number, name, exercises)")
    .eq("id", planId)
    .eq("trainer_id", user.id)
    .order("day_number", { referencedTable: "workout_days", ascending: true })
    .maybeSingle();
  if (!plan) return { error: await tErr("planNotFound") };

  const review = await getPlanReview(planId);
  const ready = review?.ready ?? {};
  const tr = await getTranslations("plans.review");

  const { data: created, error } = await supabase
    .from("workout_plans")
    .insert({
      client_id: plan.client_id,
      trainer_id: user.id,
      name: tr("repeatName", { name: plan.name as string }).slice(0, 120),
      published: false,
    })
    .select("id")
    .single();
  if (error || !created) return { error: error?.message ?? (await tErr("plans.createPlanFailed")) };

  const days = (plan.workout_days ?? []) as { day_number: number; name: string; exercises: unknown }[];
  const rows = days.map((d) => ({
    plan_id: created.id,
    day_number: d.day_number,
    name: d.name,
    exercises: ((Array.isArray(d.exercises) ? d.exercises : []) as WorkoutExerciseEntry[]).map((e) => {
      const base = e.entry_id ? ready[e.entry_id] : undefined;
      return { ...e, entry_id: randomUUID(), load_kg: base != null ? progressLoad(base, pct) : e.load_kg };
    }),
  }));
  if (rows.length > 0) {
    const { error: daysErr } = await supabase.from("workout_days").insert(rows);
    if (daysErr) {
      await supabase.from("workout_plans").delete().eq("id", created.id);
      return { error: await dbErr(daysErr, "actions") };
    }
  }

  revalidatePath("/dashboard/treningy");
  redirect(`/dashboard/treningy/${created.id}`);
}

/**
 * Premenovanie plánu (ceruzka pri názve na detaile plánu). Nový názov vidí aj
 * klient v portáli; šablóna sa odteraz ukladá pod týmto názvom. RLS
 * workout_plans_update_own_trainer — cudzí plán vráti 0 riadkov, nie chybu.
 */
export async function renamePlanAction(planId: string, rawName: string): Promise<ActionState> {
  if (!planId) return { error: await tErr("plans.missingPlanId") };
  const name = rawName.trim();
  if (!name) return { error: await tErr("plans.planNameRequired") };
  if (name.length > 120) return { error: await tErr("plans.planNameTooLong") };

  // zámok aj session naraz (predtým za sebou)
  const supabase = await createClient();
  const [locked, { data: { user } }] = await Promise.all([isPlanLocked(supabase, planId), supabase.auth.getUser()]);
  if (locked) return { error: await tErr("planLocked") };
  if (!user) return { error: await tErr("notSignedIn") };

  const target = await editTarget(supabase, planId);
  const { data, error } = await supabase
    .from("workout_plans")
    .update({ name })
    .eq("id", target.planId)
    .eq("trainer_id", user.id)
    .select("client_id");
  if (error) return { error: await dbErr(error, "actions") };
  if (!data || data.length === 0) return { error: await tErr("plans.renamePlanFailed") };

  revalidatePath(`/dashboard/treningy/${planId}`);
  revalidatePath("/dashboard/treningy");
  revalidatePath(`/dashboard/klienti/${data[0].client_id}`);
  return ok;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Kam zapísať úpravu z buildera (0071): koncept → priamo do neho (ako doteraz); zverejnený
 * plán → do skrytej kópie rozpracovaných úprav (start_plan_edit ju pri prvej úprave
 * vytvorí), ktorú klient nevidí, kým tréner nedá „Uložiť úpravy“. Deň živého plánu sa
 * preloží na jeho náprotivok v kópii (source_day_id). revalidatePath ostáva na živom pláne (URL).
 */
async function editTarget(
  supabase: Supabase,
  planId: string,
  dayId?: string | null,
): Promise<{ planId: string; dayId: string | null }> {
  const { data, error } = await supabase.rpc("start_plan_edit", { p_plan: planId });
  // bez RPC (napr. pred migráciou) / cudzí plán — zápis ide ako doteraz, RLS ho aj tak ustráži
  const target = !error && typeof data === "string" ? data : planId;
  if (!dayId || target === planId) return { planId: target, dayId: dayId ?? null };
  const { data: day } = await supabase
    .from("workout_days")
    .select("id")
    .eq("plan_id", target)
    .or(`id.eq.${dayId},source_day_id.eq.${dayId}`)
    .limit(1)
    .maybeSingle();
  return { planId: target, dayId: (day?.id as string | undefined) ?? null };
}

/** „Uložiť úpravy“ zverejneného plánu — rozpracované úpravy z kópie do plánu, ktorý vidí klient. */
export async function savePlanEditsAction(planId: string): Promise<ActionState> {
  if (!planId) return { error: await tErr("plans.missingPlanId") };
  const supabase = await createClient();
  const { error } = await supabase.rpc("apply_plan_edits", { p_plan: planId });
  if (error) return { error: await dbErr(error, "actions") };
  const { data: plan } = await supabase.from("workout_plans").select("client_id").eq("id", planId).maybeSingle();
  revalidatePath(`/dashboard/treningy/${planId}`);
  if (plan?.client_id) revalidatePath(`/dashboard/klienti/${plan.client_id}`);
  revalidatePath("/portal", "layout");
  return ok;
}

/** „Zahodiť úpravy“ — zmaže skrytú kópiu, klient má ďalej pôvodný plán. */
export async function discardPlanEditsAction(planId: string): Promise<ActionState> {
  if (!planId) return { error: await tErr("plans.missingPlanId") };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: await tErr("notSignedIn") };
  const { error } = await supabase.from("workout_plans").delete().eq("edit_of", planId).eq("trainer_id", user.id);
  if (error) return { error: await dbErr(error, "actions") };
  revalidatePath(`/dashboard/treningy/${planId}`);
  return ok;
}

/** Potvrdenie/koncept plánu — kým je `published: false`, klient ho v portáli nevidí. */
export async function setPlanPublishedAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const planId = formData.get("plan_id") as string | null;
  const published = formData.get("published") === "true";
  if (!planId) return { error: await tErr("plans.missingPlanId") };

  const [locked, { data: { user } }] = await Promise.all([isPlanLocked(supabase, planId), supabase.auth.getUser()]);
  if (!user) return { error: await tErr("notSignedIn") };
  if (locked) return { error: await tErr("planLocked") };

  // skrytá kópia rozpracovaných úprav (0071) sa nezverejňuje — ukladá sa cez „Uložiť úpravy“
  const { error } = await supabase
    .from("workout_plans")
    .update({ published })
    .eq("id", planId)
    .eq("trainer_id", user.id)
    .is("edit_of", null);

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

  if (!planId) return { error: await tErr("plans.missingPlanId") };
  if (!name) return { error: await tErr("plans.dayNameRequired") };
  if (await isPlanLocked(supabase, planId)) return { error: await tErr("planLocked") };

  const target = await editTarget(supabase, planId);
  const { error } = await supabase.from("workout_days").insert({
    plan_id: target.planId,
    day_number: clampInt(dayNumber, 1, 100, 1),
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
  if (!planId || !dayId) return { error: await tErr("plans.missingDayId") };

  const supabase = await createClient();
  const target = await editTarget(supabase, planId, dayId);
  if (!target.dayId) return { error: await tErr("plans.dayNotFound") };
  const [{ locked, dayDone }, { data: { user } }] = await Promise.all([
    getDayForEdit(supabase, target.dayId),
    supabase.auth.getUser(),
  ]);
  if (locked) return { error: await tErr("planLocked") };
  // odcvičený deň sa nemaže (záznam by ostal, ale deň v pláne patrí k nemu)
  if (dayDone) return { error: await tErr("dayLocked") };
  if (!user) return { error: await tErr("notSignedIn") };

  // RLS workout_days_delete_own_trainer — cudzí deň vráti 0 riadkov, nie chybu.
  const { data: deleted, error } = await supabase
    .from("workout_days")
    .delete()
    .eq("id", target.dayId)
    .eq("plan_id", target.planId)
    .select("id");
  if (error) return { error: await dbErr(error, "actions") };
  if (!deleted || deleted.length === 0) return { error: await tErr("plans.deleteDayFailed") };

  const { data: rest } = await supabase
    .from("workout_days")
    .select("id, day_number")
    .eq("plan_id", target.planId)
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
  if (!planId || !dayId) return { error: await tErr("plans.missingDayId") };
  const name = rawName.trim();
  if (!name) return { error: await tErr("plans.dayNameRequired") };
  if (name.length > 120) return { error: await tErr("plans.dayNameTooLong") };

  const supabase = await createClient();
  const target = await editTarget(supabase, planId, dayId);
  if (!target.dayId) return { error: await tErr("plans.dayNotFound") };
  const lock = await getDayForEdit(supabase, target.dayId);
  if (lock.locked) return { error: await tErr("planLocked") };
  if (lock.dayDone) return { error: await tErr("dayLocked") };

  // RLS workout_days_update_own_trainer — cudzí deň vráti 0 riadkov, nie chybu.
  const { data, error } = await supabase
    .from("workout_days")
    .update({ name })
    .eq("id", target.dayId)
    .eq("plan_id", target.planId)
    .select("id");
  if (error) return { error: await dbErr(error, "actions") };
  if (!data || data.length === 0) return { error: await tErr("plans.renameDayFailed") };

  revalidatePath(`/dashboard/treningy/${planId}`);
  return ok;
}

/**
 * "Duplikovať" v builderi (rovnako ako v jedálničku) — kópia dňa aj s cvikmi (nové entry_id)
 * na koniec plánu, názov „… (kópia)“. Vráti ID nového dňa, builder sa naň prepne.
 * Uzamknutý (celý odcvičený) plán ani odcvičený deň sa nekopíruje; RLS — cudzí deň/plán sa nenájde.
 */
export async function duplicateDayAction(planId: string, dayId: string): Promise<{ error: string | null; dayId: string | null }> {
  const fail = (error: string) => ({ error, dayId: null });
  if (!planId || !dayId) return fail(await tErr("plans.missingDayId"));

  const supabase = await createClient();
  const target = await editTarget(supabase, planId, dayId);
  if (!target.dayId) return fail(await tErr("plans.dayNotFoundRefresh"));
  const [{ locked, dayDone }, { data: src }, { count }] = await Promise.all([
    getDayForEdit(supabase, target.dayId),
    supabase.from("workout_days").select("name, exercises").eq("id", target.dayId).eq("plan_id", target.planId).maybeSingle(),
    supabase.from("workout_days").select("id", { count: "exact", head: true }).eq("plan_id", target.planId),
  ]);
  if (locked) return fail(await tErr("planLocked"));
  if (dayDone) return fail(await tErr("dayLocked"));
  if (!src) return fail(await tErr("plans.dayNotFoundRefresh"));

  const exercises = (Array.isArray(src.exercises) ? (src.exercises as WorkoutExerciseEntry[]) : []).map((e) => ({
    ...e,
    entry_id: randomUUID(),
  }));
  const { data, error } = await supabase
    .from("workout_days")
    // dni sú po zmazaní prečíslované 1..n (deleteDayAction) → kópia ide za posledný
    .insert({ plan_id: target.planId, day_number: (count ?? 0) + 1, name: (await tErr("plans.copySuffix", { name: src.name })).slice(0, 120), exercises })
    .select("id")
    .single();
  if (error || !data) return fail(error ? await dbErr(error, "actions") : await tErr("plans.duplicateDayFailed"));

  revalidatePath(`/dashboard/treningy/${planId}`);
  revalidatePath("/dashboard/treningy");
  return { error: null, dayId: data.id };
}

/** Klik na cvik v knižnici → pridá ho do aktívneho dňa s hodnotami posledného cviku a vráti jeho ID (builder ho hneď otvorí na úpravu). */
export async function addExerciseToDayAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();

  const dayId = formData.get("day_id") as string | null;
  const planId = formData.get("plan_id") as string | null;
  const exerciseId = formData.get("exercise_id") as string | null;

  if (!dayId) return { error: await tErr("plans.createOrPickDay") };
  if (!planId) return { error: await tErr("plans.missingPlanId") };
  if (!exerciseId) return { error: "Vyber cvik." };

  // Deň + zámok (jeden dopyt) a cvik naraz — predtým 5 dopytov za sebou pred zápisom.
  const target = await editTarget(supabase, planId, dayId);
  if (!target.dayId) return { error: await tErr("plans.dayNotFound") };
  const targetDayId = target.dayId;
  const [{ day, locked, dayDone }, { data: exercise }] = await Promise.all([
    getDayForEdit(supabase, targetDayId),
    supabase.from("exercises").select("name, name_sk").eq("id", exerciseId).maybeSingle(),
  ]);
  if (locked) return { error: await tErr("planLocked") };
  if (dayDone) return { error: await tErr("dayLocked") };
  if (!exercise) return { error: await tErr("plans.exerciseNotFound") };
  if (!day) return { error: await tErr("plans.dayNotFound") };

  const current = (Array.isArray(day.exercises) ? day.exercises : []) as WorkoutExerciseEntry[];
  // hodnoty z posledného cviku dňa (pridať a vyplniť v jednom kroku — lib/workouts/nextEntryDefaults)
  const last = current[current.length - 1];
  const defaults = nextEntryDefaults(last ? { sets: last.sets, reps: last.reps, restSeconds: last.rest_seconds } : null);
  const newEntry: WorkoutExerciseEntry = {
    entry_id: randomUUID(),
    exercise_id: exerciseId,
    // Rovnaký názov, aký tréner vidí v knižnici (AI generátor aj ClientPlanBuilder
    // ukladajú tiež name_sk) — inak plán, portál aj analytika ukazovali anglicky.
    exercise_name: displayExerciseName(exercise.name, exercise.name_sk),
    sets: defaults.sets,
    reps: defaults.reps,
    load_kg: null,
    tempo: null,
    rest_seconds: defaults.restSeconds,
  };

  const { error } = await supabase
    .from("workout_days")
    .update({ exercises: [...current, newEntry] })
    .eq("id", targetDayId);

  if (error) return { error: await dbErr(error, "actions") };

  revalidatePath(`/dashboard/treningy/${planId}`);
  return { error: null, entryId: newEntry.entry_id };
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

  if (!dayId) return { error: await tErr("plans.addDayFirst") };
  if (!planId) return { error: await tErr("plans.missingPlanId") };
  if (!name) return { error: await tErr("plans.exerciseNameRequired") };

  const target = await editTarget(supabase, planId, dayId);
  if (!target.dayId) return { error: await tErr("plans.dayNotFound") };
  const targetDayId = target.dayId;
  const { day, locked, dayDone } = await getDayForEdit(supabase, targetDayId);
  if (locked) return { error: await tErr("planLocked") };
  if (dayDone) return { error: await tErr("dayLocked") };
  if (!day) return { error: await tErr("plans.dayNotFound") };

  const current = (Array.isArray(day.exercises) ? day.exercises : []) as WorkoutExerciseEntry[];
  const last = current[current.length - 1];
  const defaults = nextEntryDefaults(last ? { sets: last.sets, reps: last.reps, restSeconds: last.rest_seconds } : null);
  const newEntry: WorkoutExerciseEntry = {
    entry_id: randomUUID(),
    exercise_id: null,
    exercise_name: name,
    sets: defaults.sets,
    reps: defaults.reps,
    load_kg: null,
    tempo: null,
    rest_seconds: defaults.restSeconds,
  };

  const { error } = await supabase
    .from("workout_days")
    .update({ exercises: [...current, newEntry] })
    .eq("id", targetDayId);

  if (error) return { error: await dbErr(error, "actions") };

  revalidatePath(`/dashboard/treningy/${planId}`);
  return { error: null, entryId: newEntry.entry_id };
}

export async function updateExerciseEntryAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();

  const dayId = formData.get("day_id") as string | null;
  const planId = formData.get("plan_id") as string | null;
  const entryId = formData.get("entry_id") as string | null;
  const sets = Number(formData.get("sets"));
  const reps = (formData.get("reps") as string | null)?.trim() ?? "";
  const loadRaw = (formData.get("load_kg") as string | null)?.trim();
  // „tempo“ = poznámka k cviku (lib/workouts/exerciseNote.ts)
  const tempo = (formData.get("tempo") as string | null)?.trim().slice(0, EXERCISE_NOTE_MAX) || null;
  const restRaw = (formData.get("rest_seconds") as string | null)?.trim();

  if (!dayId || !planId || !entryId) return { error: await tErr("plans.missingEntryId") };
  if (!Number.isFinite(sets) || sets < 1) return { error: await tErr("plans.setsRequired") };
  if (!reps) return { error: "Zadaj opakovania." };

  const target = await editTarget(supabase, planId, dayId);
  if (!target.dayId) return { error: await tErr("plans.dayNotFound") };
  const targetDayId = target.dayId;
  const { day, locked, dayDone } = await getDayForEdit(supabase, targetDayId);
  if (locked) return { error: await tErr("planLocked") };
  if (dayDone) return { error: await tErr("dayLocked") };
  if (!day) return { error: await tErr("plans.dayNotFound") };

  const current = (Array.isArray(day.exercises) ? day.exercises : []) as WorkoutExerciseEntry[];
  const updated = current.map((entry) =>
    entry.entry_id === entryId
      ? {
          ...entry,
          // hranice rovnako ako pri vlastnom pláne klienta (app/portal/trening/actions.ts)
          sets: clampInt(sets, 1, 20, 3),
          reps: reps.slice(0, 20),
          load_kg: optionalNum(loadRaw, 0, 1000),
          tempo,
          rest_seconds: restRaw ? clampInt(restRaw, 0, 3600, 0) : null,
        }
      : entry
  );

  const { error } = await supabase.from("workout_days").update({ exercises: updated }).eq("id", targetDayId);
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
  if (!planId || !dayId || !entryId) return { error: await tErr("plans.missingEntryId") };

  const supabase = await createClient();
  const target = await editTarget(supabase, planId, dayId);
  if (!target.dayId) return { error: await tErr("plans.dayNotFound") };
  const targetDayId = target.dayId;
  const { day, locked, dayDone } = await getDayForEdit(supabase, targetDayId);
  if (locked) return { error: await tErr("planLocked") };
  if (dayDone) return { error: await tErr("dayLocked") };
  if (!day) return { error: await tErr("plans.dayNotFound") };

  const current = (Array.isArray(day.exercises) ? day.exercises : []) as WorkoutExerciseEntry[];
  const idx = current.findIndex((e) => e.entry_id === entryId);
  if (idx < 0) return { error: await tErr("plans.exerciseNotFound") };

  const to = direction === "up" ? idx - 1 : idx + 1;
  if (to < 0 || to >= current.length) return ok; // už na kraji — nič nemeníme

  const swapped = [...current];
  [swapped[idx], swapped[to]] = [swapped[to], swapped[idx]];
  // presunutý cvik vypadne zo supersérie (skupina ostane súvislá)
  const updated = detachFromSuperset(swapped, to);

  const { error } = await supabase.from("workout_days").update({ exercises: updated }).eq("id", targetDayId);
  if (error) return { error: await dbErr(error, "actions") };

  revalidatePath(`/dashboard/treningy/${planId}`);
  return ok;
}

export async function removeExerciseEntryAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();

  const dayId = formData.get("day_id") as string | null;
  const planId = formData.get("plan_id") as string | null;
  const entryId = formData.get("entry_id") as string | null;

  if (!dayId || !planId || !entryId) return { error: await tErr("plans.missingEntryId") };

  const target = await editTarget(supabase, planId, dayId);
  if (!target.dayId) return { error: await tErr("plans.dayNotFound") };
  const targetDayId = target.dayId;
  const { day, locked, dayDone } = await getDayForEdit(supabase, targetDayId);
  if (locked) return { error: await tErr("planLocked") };
  if (dayDone) return { error: await tErr("dayLocked") };
  if (!day) return { error: await tErr("plans.dayNotFound") };

  const current = (Array.isArray(day.exercises) ? day.exercises : []) as WorkoutExerciseEntry[];
  // supersériu, z ktorej ostal jeden cvik, zruší
  const updated = normalizeSupersets(current.filter((entry) => entry.entry_id !== entryId));

  const { error } = await supabase.from("workout_days").update({ exercises: updated }).eq("id", targetDayId);
  if (error) return { error: await dbErr(error, "actions") };

  revalidatePath(`/dashboard/treningy/${planId}`);
  return ok;
}

/**
 * Superséria: spojí cvik s nasledujúcim (alebo spojenie zruší — rozdelí skupinu medzi
 * nimi). Volá sa priamo z PlanBuilderu (tlačidlo reťaze medzi kartami), ktorý si zmenu
 * ukáže optimisticky. lib/workouts/superset.ts.
 */
export async function toggleSupersetLinkAction(input: { planId: string; dayId: string; entryId: string }): Promise<ActionState> {
  const { planId, dayId, entryId } = input;
  if (!planId || !dayId || !entryId) return { error: await tErr("plans.missingEntryId") };

  const supabase = await createClient();
  const target = await editTarget(supabase, planId, dayId);
  if (!target.dayId) return { error: await tErr("plans.dayNotFound") };
  const targetDayId = target.dayId;
  const { day, locked, dayDone } = await getDayForEdit(supabase, targetDayId);
  if (locked) return { error: await tErr("planLocked") };
  if (dayDone) return { error: await tErr("dayLocked") };
  if (!day) return { error: await tErr("plans.dayNotFound") };

  const current = (Array.isArray(day.exercises) ? day.exercises : []) as WorkoutExerciseEntry[];
  const idx = current.findIndex((e) => e.entry_id === entryId);
  if (idx < 0 || idx >= current.length - 1) return { error: await tErr("plans.exerciseNotFound") };

  const updated = toggleLinkWithNext(current, idx);
  const { error } = await supabase.from("workout_days").update({ exercises: updated }).eq("id", targetDayId);
  if (error) return { error: await dbErr(error, "actions") };

  revalidatePath(`/dashboard/treningy/${planId}`);
  return ok;
}

/**
 * Zmazanie plánu — koncept ("Zmazať koncept" hore), publikovaný aj hotový plán
 * ("Zmazať" dole pri PDF; karta v detaile klienta má deleteTrainerPlanAction). `workout_days` idú kaskádou (FK `on delete cascade`,
 * 0002); odcvičené tréningy ostanú: `workout_logs.workout_day_id` sa nastaví na
 * null a záznam si drží vlastnú kópiu plánu (plan_snapshot, 0048 — zámok túto
 * zmenu povoľuje). `clients.active_plan_id`/`active_day_id` sa cez FK vynulujú,
 * portál klienta potom spadne na najnovší zostávajúci plán.
 */
export async function deletePlanAction(planId: string): Promise<ActionState> {
  if (!planId) return { error: await tErr("plans.missingPlanId") };

  const supabase = await createClient();
  // aj hotový (uzamknutý) plán — odcvičené tréningy prežijú (plan_snapshot, 0048)
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: await tErr("notSignedIn") };

  const { data: deleted, error } = await supabase
    .from("workout_plans")
    .delete()
    .eq("id", planId)
    .eq("trainer_id", user.id)
    .select("client_id");
  if (error) return { error: await dbErr(error, "actions") };
  if (!deleted || deleted.length === 0) return { error: await tErr("planNotFound") };

  revalidatePath("/dashboard/treningy");
  revalidatePath(`/dashboard/klienti/${deleted[0].client_id}`);
  redirect("/dashboard/treningy");
}

export async function addCustomExerciseAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: await tErr("notSignedIn") };

  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const muscleGroup = (formData.get("muscle_group") as string | null)?.trim() || null;

  if (!name) return { error: await tErr("plans.exerciseNameRequired") };

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

async function parseAiPlanParams(raw: AiPlanParams): Promise<ValidAiPlanParams | { error: string }> {
  // Zameranie je voliteľné — chýbajúce / neznáme = "vyvážene" (bezpečný fallback).
  const focus: PlanFocus | "auto" =
    raw.focus === "auto" ? "auto" : PLAN_FOCUSES.includes(raw.focus as PlanFocus) ? (raw.focus as PlanFocus) : "vyvazene";
  // Partiové (jednodňové) zameranie ignoruje počet dní — UI ho skryje, appka vygeneruje presne 1 deň.
  const singleDay = focus !== "auto" && isSingleDayFocus(focus);
  const daysPerWeek = singleDay ? 1 : Number(raw.daysPerWeek);

  if (!raw.goal || !PLAN_GOALS.includes(raw.goal as PlanGoal)) return { error: await tErr("plans.chooseGoal") };
  if (!raw.experience || !PLAN_EXPERIENCES.includes(raw.experience as PlanExperience)) return { error: await tErr("plans.chooseExperience") };
  if (!raw.equipment || !PLAN_EQUIPMENT.includes(raw.equipment as PlanEquipment)) return { error: await tErr("plans.chooseEquipment") };
  if (!singleDay && (!Number.isInteger(daysPerWeek) || daysPerWeek < 1 || daysPerWeek > 7)) {
    return { error: await tErr("plans.daysRange") };
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
  if (!client) return { error: await tErr("plans.clientNotFound") };

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
    return { error: await tErr("plans.aiDailyLimit", { limit: AI_PLAN_GEN_DAILY_LIMIT() }) };
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
  const planName =
    plan.planName ??
    (await tErr("plans.aiPlanName", { goal: (await getTranslations("labels.planGoal"))(params.goal) }));

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
  if (planErr || !newPlan) return { error: planErr?.message ?? await tErr("plans.createPlanFailed") };

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
  if (raw === `fail:${clientId}`) return { error: "Simulované zlyhanie AI (e2e)." }; // i18n-ignore — len e2e
  const { data: exercises } = await supabase.from("exercises").select("id, name").order("name").limit(3);
  return {
    plan: {
      planName: `E2E AI · ${focus}`,
      days: [
        {
          name: "Deň 1", // i18n-ignore — len e2e fixtúra
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
  if (!user) return { error: await tErr("notSignedIn") };

  const clientId = formData.get("client_id") as string | null;
  if (!clientId) return { error: await tErr("chooseClient") };
  const params = await parseAiPlanParams({
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
  if (!user) return fail(await tErr("notSignedIn"));
  if (!clientId) return fail(await tErr("chooseClient"));
  const params = await parseAiPlanParams(raw);
  if ("error" in params) return fail(params.error);

  const generated = await generateAiPlanForClient(supabase, user.id, params, clientId);
  if ("error" in generated) return fail(generated.error);
  revalidatePath("/dashboard/treningy");
  revalidatePath(`/dashboard/klienti/${clientId}`);
  return { error: null, planId: generated.planId, warnings: generated.warnings };
}
