"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  saveWorkoutPlanAsTemplate,
  applyWorkoutTemplateToClient,
  deleteWorkoutTemplate,
  saveMealPlanAsTemplate,
  applyMealTemplateToClient,
  deleteMealTemplate,
} from "@/lib/templates";
import { addPlanRecipients } from "@/lib/planRecipients";

export interface ActionState {
  error: string | null;
}
const ok: ActionState = { error: null };

/** "Uložiť ako šablónu" na detaile tréningového plánu (`/dashboard/treningy/[planId]`). */
export async function saveWorkoutTemplateAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const planId = (formData.get("plan_id") as string | null) ?? "";
  const name = (formData.get("name") as string | null) ?? "";
  const goal = (formData.get("goal") as string | null) ?? null;
  if (!planId) return { error: "Chýba ID plánu." };

  const result = await saveWorkoutPlanAsTemplate(supabase, user.id, planId, name, goal);
  if (result.error) return result;

  revalidatePath("/dashboard/sablony");
  return ok;
}

/** "Uložiť ako šablónu" na detaile jedálničku (`/dashboard/jedalnicky/jedalnicek/[planId]`). */
export async function saveMealTemplateAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const planId = (formData.get("plan_id") as string | null) ?? "";
  const name = (formData.get("name") as string | null) ?? "";
  if (!planId) return { error: "Chýba ID jedálničku." };

  const result = await saveMealPlanAsTemplate(supabase, user.id, planId, name);
  if (result.error) return result;

  revalidatePath("/dashboard/sablony");
  return ok;
}

export interface ApplyToClientsResult {
  error: string | null;
  /** builder vytvoreného konceptu (tréningový plán / jedálniček) */
  href: string | null;
}

/** horná hranica naraz — šablóna pre celú skupinu klientov, nie hromadný import */
const MAX_APPLY_CLIENTS = 50;

/**
 * „Použiť“ šablónu pre jedného alebo viacerých klientov — vznikne JEDEN koncept (pre prvého
 * vybraného klienta) a ostatní sa uložia ako jeho ďalší príjemcovia (0052). Tréner koncept
 * upraví v builderi; pri odoslaní dostane každý príjemca vlastnú kópiu (lib/planRecipients).
 * Vlastníctvo šablóny aj klientov overuje applyWorkout/MealTemplateToClient a RLS.
 */
export async function applyTemplateToClientsAction(
  kind: "workout" | "meal",
  templateId: string,
  clientIds: string[],
): Promise<ApplyToClientsResult> {
  const fail = (error: string): ApplyToClientsResult => ({ error, href: null });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Nie si prihlásený.");
  if (!templateId) return fail("Chýba šablóna.");
  const ids = [...new Set(clientIds.filter((id) => typeof id === "string" && id))];
  if (ids.length === 0) return fail("Vyber aspoň jedného klienta.");
  if (ids.length > MAX_APPLY_CLIENTS) return fail(`Naraz najviac ${MAX_APPLY_CLIENTS} klientov.`);

  const [mainClientId, ...others] = ids;
  if (others.length > 0) {
    // ostatní musia byť tiež trénerovi klienti — inak by sa koncept vytvoril zbytočne
    const { count } = await supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .in("id", others)
      .eq("trainer_id", user.id);
    if (count !== others.length) return fail("Niektorý z vybraných klientov nepatrí tebe.");
  }

  const applied =
    kind === "workout"
      ? await applyWorkoutTemplateToClient(supabase, user.id, templateId, mainClientId)
      : await applyMealTemplateToClient(supabase, user.id, templateId, mainClientId);
  if (applied.error || !applied.planId) return fail(applied.error ?? "Koncept sa nepodarilo vytvoriť.");

  const recipientsError = await addPlanRecipients(supabase, user.id, kind, applied.planId, others);
  if (recipientsError) {
    // bez príjemcov by koncept dostal len prvý klient — radšej nič a jasná chyba
    await supabase.from(kind === "workout" ? "workout_plans" : "meal_plans").delete().eq("id", applied.planId);
    return fail(`Ďalších klientov sa nepodarilo pridať: ${recipientsError}`);
  }

  revalidatePath(kind === "workout" ? "/dashboard/treningy" : "/dashboard/jedalnicky");
  return {
    error: null,
    href: kind === "workout" ? `/dashboard/treningy/${applied.planId}` : `/dashboard/jedalnicky/jedalnicek/${applied.planId}`,
  };
}

export async function deleteWorkoutTemplateAction(templateId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !templateId) return;
  const { error } = await deleteWorkoutTemplate(supabase, user.id, templateId);
  if (!error) revalidatePath("/dashboard/sablony");
}

export async function deleteMealTemplateAction(templateId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !templateId) return;
  const { error } = await deleteMealTemplate(supabase, user.id, templateId);
  if (!error) revalidatePath("/dashboard/sablony");
}
