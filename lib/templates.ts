// FitPilot — Šablóny plánov (feature/progress-AI-sablona, 0025_templates.sql):
// zdieľaná logika pre tréningové aj jedálničkové šablóny. RLS na *_templates
// tabuľkách už obmedzuje všetko na `trainer_id = auth.uid()` — funkcie tu
// vždy navyše explicitne overia `trainer_id = trainerId` na zdrojovom
// pláne/kliente (rovnaká "dvojitá poistka" ako v ostatných actions.ts), nech
// chybová hláška je jasná namiesto tichého prázdneho výsledku z RLS.
//
// `exercises`/`meals` sa kopírujú 1:1 ako jsonb blob (rovnaký tvar ako
// workout_days.exercises / meal_days.meals) — appka do nich nezasahuje, len
// ich presúva medzi tabuľkami.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlanGoal } from "./planGoals";

export interface TemplateResult {
  error: string | null;
}
const ok: TemplateResult = { error: null };

export interface AppliedTemplateResult {
  error: string | null;
  planId: string | null;
}

const MAX_NAME_LEN = 120;

function cleanName(raw: string | null | undefined, fallback: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, MAX_NAME_LEN);
}

// ---------- tréningové šablóny ----------

export async function saveWorkoutPlanAsTemplate(
  supabase: SupabaseClient,
  trainerId: string,
  planId: string,
  templateName: string,
  goal?: string | null,
): Promise<TemplateResult> {
  const { data: plan } = await supabase.from("workout_plans").select("id, name").eq("id", planId).eq("trainer_id", trainerId).maybeSingle();
  if (!plan) return { error: "Plán sa nenašiel." };

  const { data: days, error: daysErr } = await supabase
    .from("workout_days")
    .select("day_number, name, exercises")
    .eq("plan_id", planId)
    .order("day_number");
  if (daysErr) return { error: daysErr.message };
  if (!days || days.length === 0) return { error: "Plán nemá žiadne dni na uloženie do šablóny." };

  const { data: template, error: templateErr } = await supabase
    .from("plan_templates")
    .insert({ trainer_id: trainerId, name: cleanName(templateName, plan.name), goal: isPlanGoal(goal) ? goal : null })
    .select("id")
    .single();
  if (templateErr || !template) return { error: templateErr?.message ?? "Šablónu sa nepodarilo vytvoriť." };

  const rows = days.map((d) => ({ template_id: template.id, day_number: d.day_number, name: d.name, exercises: d.exercises }));
  const { error: insertErr } = await supabase.from("plan_template_days").insert(rows);
  if (insertErr) {
    // Šablóna bez dní by len strašila v zozname ako prázdna — radšej ju zmazať.
    await supabase.from("plan_templates").delete().eq("id", template.id);
    return { error: insertErr.message };
  }
  return ok;
}

export async function applyWorkoutTemplateToClient(
  supabase: SupabaseClient,
  trainerId: string,
  templateId: string,
  clientId: string,
): Promise<AppliedTemplateResult> {
  const [{ data: template }, { data: client }] = await Promise.all([
    supabase.from("plan_templates").select("id, name").eq("id", templateId).eq("trainer_id", trainerId).maybeSingle(),
    supabase.from("clients").select("id").eq("id", clientId).eq("trainer_id", trainerId).maybeSingle(),
  ]);
  if (!template) return { error: "Šablóna sa nenašla.", planId: null };
  if (!client) return { error: "Tento klient nepatrí tebe.", planId: null };

  const { data: templateDays, error: daysErr } = await supabase
    .from("plan_template_days")
    .select("day_number, name, exercises")
    .eq("template_id", templateId)
    .order("day_number");
  if (daysErr) return { error: daysErr.message, planId: null };

  // Nový plán je koncept (published: false), presne ako ručne vytvorený alebo AI vygenerovaný —
  // tréner ho doladí v builderi pred publikovaním klientovi (draft-then-approve, 0021).
  const { data: newPlan, error: planErr } = await supabase
    .from("workout_plans")
    .insert({ client_id: clientId, trainer_id: trainerId, name: template.name, published: false })
    .select("id")
    .single();
  if (planErr || !newPlan) return { error: planErr?.message ?? "Plán sa nepodarilo vytvoriť.", planId: null };

  if (templateDays && templateDays.length > 0) {
    const rows = templateDays.map((d) => ({ plan_id: newPlan.id, day_number: d.day_number, name: d.name, exercises: d.exercises }));
    const { error: insertErr } = await supabase.from("workout_days").insert(rows);
    if (insertErr) return { error: insertErr.message, planId: newPlan.id };
  }

  return { error: null, planId: newPlan.id };
}

export async function deleteWorkoutTemplate(supabase: SupabaseClient, trainerId: string, templateId: string): Promise<TemplateResult> {
  const { error } = await supabase.from("plan_templates").delete().eq("id", templateId).eq("trainer_id", trainerId);
  if (error) return { error: error.message };
  return ok;
}

// ---------- jedálničkové šablóny ----------

export async function saveMealPlanAsTemplate(
  supabase: SupabaseClient,
  trainerId: string,
  planId: string,
  templateName: string,
): Promise<TemplateResult> {
  const { data: plan } = await supabase.from("meal_plans").select("id, name").eq("id", planId).eq("trainer_id", trainerId).maybeSingle();
  if (!plan) return { error: "Jedálniček sa nenašiel." };

  const { data: days, error: daysErr } = await supabase
    .from("meal_days")
    .select("day_number, name, meals")
    .eq("plan_id", planId)
    .order("day_number");
  if (daysErr) return { error: daysErr.message };
  if (!days || days.length === 0) return { error: "Jedálniček nemá žiadne dni na uloženie do šablóny." };

  const { data: template, error: templateErr } = await supabase
    .from("meal_templates")
    .insert({ trainer_id: trainerId, name: cleanName(templateName, plan.name) })
    .select("id")
    .single();
  if (templateErr || !template) return { error: templateErr?.message ?? "Šablónu sa nepodarilo vytvoriť." };

  const rows = days.map((d) => ({ template_id: template.id, day_number: d.day_number, name: d.name, meals: d.meals }));
  const { error: insertErr } = await supabase.from("meal_template_days").insert(rows);
  if (insertErr) {
    await supabase.from("meal_templates").delete().eq("id", template.id);
    return { error: insertErr.message };
  }
  return ok;
}

export async function applyMealTemplateToClient(
  supabase: SupabaseClient,
  trainerId: string,
  templateId: string,
  clientId: string,
): Promise<AppliedTemplateResult> {
  const [{ data: template }, { data: client }] = await Promise.all([
    supabase.from("meal_templates").select("id, name").eq("id", templateId).eq("trainer_id", trainerId).maybeSingle(),
    supabase.from("clients").select("id").eq("id", clientId).eq("trainer_id", trainerId).maybeSingle(),
  ]);
  if (!template) return { error: "Šablóna sa nenašla.", planId: null };
  if (!client) return { error: "Tento klient nepatrí tebe.", planId: null };

  const { data: templateDays, error: daysErr } = await supabase
    .from("meal_template_days")
    .select("day_number, name, meals")
    .eq("template_id", templateId)
    .order("day_number");
  if (daysErr) return { error: daysErr.message, planId: null };

  const { data: newPlan, error: planErr } = await supabase
    .from("meal_plans")
    .insert({ client_id: clientId, trainer_id: trainerId, name: template.name })
    .select("id")
    .single();
  if (planErr || !newPlan) return { error: planErr?.message ?? "Jedálniček sa nepodarilo vytvoriť.", planId: null };

  if (templateDays && templateDays.length > 0) {
    const rows = templateDays.map((d) => ({ plan_id: newPlan.id, day_number: d.day_number, name: d.name, meals: d.meals }));
    const { error: insertErr } = await supabase.from("meal_days").insert(rows);
    if (insertErr) return { error: insertErr.message, planId: newPlan.id };
  }

  return { error: null, planId: newPlan.id };
}

export async function deleteMealTemplate(supabase: SupabaseClient, trainerId: string, templateId: string): Promise<TemplateResult> {
  const { error } = await supabase.from("meal_templates").delete().eq("id", templateId).eq("trainer_id", trainerId);
  if (error) return { error: error.message };
  return ok;
}
