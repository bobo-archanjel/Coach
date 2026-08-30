"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/* Vlastný tréning klienta — vytvorenie / úprava / zmazanie / prepnutie aktívneho.
   Klientské plány: workout_plans.trainer_id IS NULL (viď 0010_client_own_workouts.sql).
   RLS dovoľuje klientovi CUD len na jeho vlastné plány; navyše tu overujeme
   vlastníctvo explicitne kvôli čistej chybovej hláške. */

export interface ActionState {
  error: string | null;
  planId?: string;
}
const ok: ActionState = { error: null };

export interface DraftExercise {
  entryId?: string;
  exerciseId: string | null;
  name: string;
  sets: number;
  reps: string;
  loadKg: number | null;
  tempo: string | null;
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
  tempo: string | null;
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
        tempo: cleanText(x.tempo, 15) || null,
        rest_seconds: rest === null ? null : Math.round(rest),
      };
    })
    .filter((e): e is CleanEntry => e !== null);
}

type CleanDay = { id: string | null; name: string; exercises: CleanEntry[] };

function cleanDraft(raw: unknown): { name: string; days: CleanDay[] } | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Chýbajú dáta tréningu." };
  const d = raw as Record<string, unknown>;
  const name = cleanText(d.name, 60);
  if (!name) return { error: "Zadaj názov tréningu." };

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

  if (days.length === 0) return { error: "Pridaj aspoň jeden deň s názvom." };
  return { name, days };
}

/** Klient prepojený s prihláseným používateľom — vytvorí "self" riadok, ak treba. */
async function ensureSelfClientId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ clientId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("ensure_self_client");
  if (error) {
    if (error.message.includes("not_a_client")) return { clientId: null, error: "Vlastné tréningy môže vytvárať len klient." };
    return { clientId: null, error: error.message };
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
  if (!user) return { error: "Nie si prihlásený." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(draftJson);
  } catch {
    return { error: "Neplatné dáta tréningu." };
  }
  const cleaned = cleanDraft(parsed);
  if ("error" in cleaned) return { error: cleaned.error };

  const { clientId, error: cErr } = await ensureSelfClientId(supabase);
  if (cErr || !clientId) return { error: cErr ?? "Nepodarilo sa nájsť tvoj profil." };

  // ---------- vytvorenie ----------
  if (!planId) {
    const { data: plan, error: planErr } = await supabase
      .from("workout_plans")
      .insert({ client_id: clientId, trainer_id: null, name: cleaned.name })
      .select("id")
      .single();
    if (planErr || !plan) return { error: planErr?.message ?? "Tréning sa nepodarilo vytvoriť." };

    if (cleaned.days.length > 0) {
      const { error: daysErr } = await supabase.from("workout_days").insert(
        cleaned.days.map((day, i) => ({
          plan_id: plan.id,
          day_number: i + 1,
          name: day.name,
          exercises: day.exercises,
        })),
      );
      if (daysErr) return { error: daysErr.message };
    }

    await supabase.rpc("set_active_plan", { p_plan_id: plan.id });
    revalidatePath("/portal", "layout");
    return { error: null, planId: plan.id };
  }

  // ---------- úprava ----------
  const { data: existing, error: exErr } = await supabase
    .from("workout_plans")
    .select("id, trainer_id, client_id")
    .eq("id", planId)
    .maybeSingle();
  if (exErr) return { error: exErr.message };
  if (!existing || existing.trainer_id !== null || existing.client_id !== clientId) {
    return { error: "Tento tréning nemôžeš upraviť." };
  }

  const { error: nameErr } = await supabase.from("workout_plans").update({ name: cleaned.name }).eq("id", planId);
  if (nameErr) return { error: nameErr.message };

  const { data: currentDays, error: cdErr } = await supabase
    .from("workout_days")
    .select("id")
    .eq("plan_id", planId);
  if (cdErr) return { error: cdErr.message };

  const currentIds = new Set((currentDays ?? []).map((d) => d.id));
  const keptIds = new Set<string>();

  for (let i = 0; i < cleaned.days.length; i++) {
    const day = cleaned.days[i];
    if (day.id && currentIds.has(day.id)) {
      keptIds.add(day.id);
      const { error } = await supabase
        .from("workout_days")
        .update({ name: day.name, day_number: i + 1, exercises: day.exercises })
        .eq("id", day.id);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase.from("workout_days").insert({
        plan_id: planId,
        day_number: i + 1,
        name: day.name,
        exercises: day.exercises,
      });
      if (error) return { error: error.message };
    }
  }

  const toDelete = [...currentIds].filter((id) => !keptIds.has(id));
  if (toDelete.length > 0) {
    const { error } = await supabase.from("workout_days").delete().in("id", toDelete);
    if (error) return { error: error.message };
  }

  revalidatePath("/portal", "layout");
  return { error: null, planId };
}

/** Zmaže vlastný tréning klienta (RLS: workout_plans_delete_own_client). */
export async function deleteClientPlanAction(planId: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const { clientId, error: cErr } = await ensureSelfClientId(supabase);
  if (cErr || !clientId) return { error: cErr ?? "Nepodarilo sa nájsť tvoj profil." };

  const { data: plan, error: pErr } = await supabase
    .from("workout_plans")
    .select("id, trainer_id, client_id")
    .eq("id", planId)
    .maybeSingle();
  if (pErr) return { error: pErr.message };
  if (!plan || plan.trainer_id !== null || plan.client_id !== clientId) {
    return { error: "Tento tréning nemôžeš zmazať." };
  }

  const { error } = await supabase.from("workout_plans").delete().eq("id", planId);
  if (error) return { error: error.message };

  // active_plan_id sa vynuluje sám (on delete set null) → Dnes spadne na najnovší.
  revalidatePath("/portal", "layout");
  return ok;
}

/** Prepne, ktorý plán klienta riadi kartu Dnes (od trénera aj vlastný). */
export async function setActivePlanAction(planId: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const { error } = await supabase.rpc("set_active_plan", { p_plan_id: planId });
  if (error) {
    if (error.message.includes("plan_not_found")) return { error: "Tréning sa nenašiel." };
    return { error: error.message };
  }

  revalidatePath("/portal", "layout");
  return ok;
}
