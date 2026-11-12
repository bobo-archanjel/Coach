"use server";

import { tErr } from "@/lib/i18n/serverErrors";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { fetchExerciseDetail, type ExerciseDetail } from "@/lib/exercises";
import { getExerciseLibrary } from "@/lib/portal/data";
import type { ExerciseOption } from "@/lib/portal/types";
import { dbErr } from "@/lib/dbError";
import { deleteWorkoutTemplate, saveOwnPlanAsTemplate } from "@/lib/templates";

/* Vlastný tréning klienta — vytvorenie / úprava / zmazanie / prepnutie aktívneho.
   Klientské plány: workout_plans.trainer_id IS NULL (viď 0010_client_own_workouts.sql).
   RLS dovoľuje klientovi CUD len na jeho vlastné plány; navyše tu overujeme
   vlastníctvo explicitne kvôli čistej chybovej hláške. */

export interface ActionState {
  error: string | null;
  planId?: string;
}
const ok: ActionState = { error: null };

/** Detail cviku (obrázky + inštrukcie) pre náhľad v builderi vlastného tréningu. */
export async function getExerciseDetailAction(exerciseId: string): Promise<ExerciseDetail | null> {
  const supabase = await createClient();
  return fetchExerciseDetail(supabase, exerciseId);
}

/**
 * Globálna knižnica cvikov (~900 riadkov) — na požiadanie, len keď klient
 * skutočne otvorí builder vlastného tréningu (`TrainingSection.openBuilder`),
 * nie ako súčasť každého načítania /portal/trening (viď lib/portal/data.ts).
 */
export async function getExerciseLibraryAction(): Promise<ExerciseOption[]> {
  // Knižnica sa číta service-role klientom (viď getExerciseLibrary) — server
  // action je verejný endpoint, takže najprv overiť, že volá prihlásený používateľ.
  // (Predtým `const user = await getUser()` — výsledok je vždy objekt { data },
  // takže kontrola nikdy nezabrala.)
  const {
    data: { user },
  } = await getUser();
  if (!user) return [];
  return getExerciseLibrary();
}

export interface DraftExercise {
  entryId?: string;
  exerciseId: string | null;
  name: string;
  sets: number;
  reps: string;
  loadKg: number | null;
  restSeconds: number | null;
}
export interface DraftDay {
  id: string | null; // null = nový deň
  name: string;
  exercises: DraftExercise[];
}
export interface PlanDraft {
  name: string;
  days: DraftDay[];
}

const MAX_DAYS = 14;
const MAX_EXERCISES = 30;

type CleanEntry = {
  entry_id: string;
  exercise_id: string | null;
  exercise_name: string;
  sets: number;
  reps: string;
  load_kg: number | null;
  rest_seconds: number | null;
};

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function optionalNum(v: unknown, min: number, max: number): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

function cleanText(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function cleanEntries(raw: unknown): CleanEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_EXERCISES)
    .map((e): CleanEntry | null => {
      if (!e || typeof e !== "object") return null;
      const x = e as Record<string, unknown>;
      const name = cleanText(x.name, 80);
      if (!name) return null;
      const rest = optionalNum(x.restSeconds, 0, 3600);
      return {
        entry_id: typeof x.entryId === "string" && x.entryId ? x.entryId : randomUUID(),
        exercise_id: typeof x.exerciseId === "string" && x.exerciseId ? x.exerciseId : null,
        exercise_name: name,
        sets: clampInt(x.sets, 1, 20, 3),
        reps: cleanText(x.reps, 20) || "10",
        load_kg: optionalNum(x.loadKg, 0, 1000),
        rest_seconds: rest === null ? null : Math.round(rest),
      };
    })
    .filter((e): e is CleanEntry => e !== null);
}

type CleanDay = { id: string | null; name: string; exercises: CleanEntry[] };

async function cleanDraft(raw: unknown): Promise<{ name: string; days: CleanDay[] } | { error: string }> {
  if (!raw || typeof raw !== "object") return { error: await tErr("client.missingWorkoutData") };
  const d = raw as Record<string, unknown>;
  const name = cleanText(d.name, 60);
  if (!name) return { error: await tErr("client.planNameRequired") };

  const daysRaw = Array.isArray(d.days) ? d.days.slice(0, MAX_DAYS) : [];
  const days: CleanDay[] = daysRaw
    .map((day): CleanDay | null => {
      if (!day || typeof day !== "object") return null;
      const dd = day as Record<string, unknown>;
      const dayName = cleanText(dd.name, 60);
      if (!dayName) return null;
      return {
        id: typeof dd.id === "string" && dd.id ? dd.id : null,
        name: dayName,
        exercises: cleanEntries(dd.exercises),
      };
    })
    .filter((x): x is CleanDay => x !== null);

  if (days.length === 0) return { error: await tErr("client.addNamedDay") };
  return { name, days };
}

/** Klient prepojený s prihláseným používateľom — vytvorí "self" riadok, ak treba. */
async function ensureSelfClientId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ clientId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("ensure_self_client");
  if (error) {
    if (error.message.includes("not_a_client")) return { clientId: null, error: await tErr("client.onlyClientOwnPlans") };
    return { clientId: null, error: await dbErr(error, "actions") };
  }
  return { clientId: (data as string) ?? null, error: null };
}

/**
 * Uloží vlastný tréning klienta. Bez `planId` = vytvorenie nového (a nastaví ho
 * ako aktívny). S `planId` = úprava existujúceho vlastného plánu — dni sa
 * zosúladia diffom (zachované id → update, nové → insert, chýbajúce → delete),
 * aby ostali stabilné workout_day_id väzby v workout_logs.
 */
export async function saveClientPlanAction(draftJson: string, planId?: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: await tErr("notSignedIn") };

  let parsed: unknown;
  try {
    parsed = JSON.parse(draftJson);
  } catch {
    return { error: await tErr("client.invalidWorkoutData") };
  }
  const cleaned = await cleanDraft(parsed);
  if ("error" in cleaned) return { error: cleaned.error };

  const { clientId, error: cErr } = await ensureSelfClientId(supabase);
  if (cErr || !clientId) return { error: cErr ?? await tErr("client.profileMissing") };

  // ---------- vytvorenie ----------
  if (!planId) {
    const { data: plan, error: planErr } = await supabase
      .from("workout_plans")
      .insert({ client_id: clientId, trainer_id: null, name: cleaned.name })
      .select("id")
      .single();
    if (planErr || !plan) return { error: planErr?.message ?? await tErr("client.planCreateFailed") };

    // Aktívny plán sa tu už nemení — nový plán zvolený aktívny neprebije; aktívnym sa
    // stane sám len pri prvom pláne klienta (trigger workout_plans_pin_active, 0056).
    if (cleaned.days.length > 0) {
      const { error: daysErr } = await supabase.from("workout_days").insert(
        cleaned.days.map((day, i) => ({
          plan_id: plan.id,
          day_number: i + 1,
          name: day.name,
          exercises: day.exercises,
        })),
      );
      if (daysErr) return { error: await dbErr(daysErr, "actions") };
    }

    revalidatePath("/portal", "layout");
    return { error: null, planId: plan.id };
  }

  // ---------- úprava ----------
  // Vlastníctvo a súčasné dni potrebujú len planId — naraz. Zápisy potom tiež naraz
  // (premenovanie, každý deň, zmazanie odobratých): predtým šiel každý deň samostatným
  // round-tripom za sebou, pri 7-dňovom pláne to boli sekundy čakania na mobile.
  // workout_days nemá unique (plan_id, day_number), prečíslovanie sa tak nebije.
  const [{ data: existing, error: exErr }, { data: currentDays, error: cdErr }] = await Promise.all([
    supabase.from("workout_plans").select("id, trainer_id, client_id").eq("id", planId).maybeSingle(),
    supabase.from("workout_days").select("id").eq("plan_id", planId),
  ]);
  if (exErr) return { error: await dbErr(exErr, "actions") };
  if (!existing || existing.trainer_id !== null || existing.client_id !== clientId) {
    return { error: await tErr("client.cannotEdit") };
  }
  if (cdErr) return { error: await dbErr(cdErr, "actions") };

  const currentIds = new Set((currentDays ?? []).map((d) => d.id));
  const keptIds = new Set(cleaned.days.map((d) => d.id).filter((id): id is string => !!id && currentIds.has(id)));
  const toDelete = [...currentIds].filter((id) => !keptIds.has(id));

  const results = await Promise.all([
    supabase.from("workout_plans").update({ name: cleaned.name }).eq("id", planId),
    ...cleaned.days.map((day, i) =>
      day.id && keptIds.has(day.id)
        ? supabase
            .from("workout_days")
            .update({ name: day.name, day_number: i + 1, exercises: day.exercises })
            .eq("id", day.id)
        : supabase.from("workout_days").insert({
            plan_id: planId,
            day_number: i + 1,
            name: day.name,
            exercises: day.exercises,
          }),
    ),
    ...(toDelete.length > 0 ? [supabase.from("workout_days").delete().in("id", toDelete)] : []),
  ]);
  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: await dbErr(failed.error, "actions") };

  revalidatePath("/portal", "layout");
  return { error: null, planId };
}

/** Zmaže vlastný tréning klienta (RLS: workout_plans_delete_own_client). */
export async function deleteClientPlanAction(planId: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: await tErr("notSignedIn") };

  const { clientId, error: cErr } = await ensureSelfClientId(supabase);
  if (cErr || !clientId) return { error: cErr ?? await tErr("client.profileMissing") };

  const { data: plan, error: pErr } = await supabase
    .from("workout_plans")
    .select("id, trainer_id, client_id")
    .eq("id", planId)
    .maybeSingle();
  if (pErr) return { error: await dbErr(pErr, "actions") };
  if (!plan || plan.trainer_id !== null || plan.client_id !== clientId) {
    return { error: await tErr("client.cannotDelete") };
  }

  const { error } = await supabase.from("workout_plans").delete().eq("id", planId);
  if (error) return { error: await dbErr(error, "actions") };

  // active_plan_id sa vynuluje sám (on delete set null) → Dnes spadne na najnovší.
  revalidatePath("/portal", "layout");
  return ok;
}

/** "Uložiť ako šablónu" pri vlastnom tréningu — kópia jeho dní do šablón klienta (lib/templates.ts). */
export async function saveOwnTemplateAction(planId: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: await tErr("notSignedIn") };

  const { clientId, error: cErr } = await ensureSelfClientId(supabase);
  if (cErr || !clientId) return { error: cErr ?? await tErr("client.profileMissing") };

  const res = await saveOwnPlanAsTemplate(supabase, user.id, clientId, planId);
  if (res.error) return { error: res.error };

  revalidatePath("/portal/trening");
  return ok;
}

/** Zmazanie šablóny klienta (len vlastnej — filter na vlastníka v deleteWorkoutTemplate aj RLS). */
export async function deleteOwnTemplateAction(templateId: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: await tErr("notSignedIn") };

  const res = await deleteWorkoutTemplate(supabase, user.id, templateId);
  if (res.error) return { error: res.error };

  revalidatePath("/portal/trening");
  return ok;
}

/**
 * "Začať tréning" / "Pozrieť tréning" v sekcii Tréning — prepne, ktorý plán (a
 * deň, 0022) riadi kartu Dnes, a rovno na ňu presmeruje. `redirect` vnútri akcie
 * = JEDEN round-trip: odpoveď akcie už nesie vykreslenú /portal. Predtým akcia
 * vrátila ok (Next pritom kvôli revalidatePath znova vykreslil opúšťanú
 * /portal/trening) a klient až potom spravil router.push → druhý request.
 * Bez getUser(): RPC set_active_plan si prihlásenie overí sám (auth.uid(),
 * 'not_authenticated') — ušetrí sieťový round-trip na Supabase Auth.
 */
export async function setActivePlanAction(planId: string, dayId?: string): Promise<ActionState> {
  const res = await callSetActivePlan(planId, dayId ?? null);
  if (res.error) return res;

  revalidatePath("/portal", "layout");
  redirect("/portal");
}

/**
 * "Nastaviť ako aktívny" (Tréning) a prepínač „Zmeniť“ na karte Dnes — len prepne,
 * ktorý plán riadi kartu Dnes (bez konkrétneho dňa, ďalší deň dopočíta rotácia),
 * tréning nespustí a nepresmeruje. Revalidácia /portal prinesie čerstvé dáta.
 */
export async function chooseActivePlanAction(planId: string): Promise<ActionState> {
  const res = await callSetActivePlan(planId, null);
  if (res.error) return res;

  revalidatePath("/portal", "layout");
  return ok;
}

/** RPC set_active_plan (0022) s ľudskými chybami — overí prihlásenie aj vlastníctvo plánu. */
async function callSetActivePlan(planId: string, dayId: string | null): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_active_plan", { p_plan_id: planId, p_day_id: dayId });
  if (!error) return ok;
  if (error.message.includes("not_authenticated")) return { error: await tErr("notSignedIn") };
  if (error.message.includes("plan_not_found")) return { error: await tErr("client.workoutNotFound") };
  if (error.message.includes("day_not_found")) return { error: await tErr("client.dayNotFound") };
  return { error: await dbErr(error, "actions") };
}
