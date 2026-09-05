"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  saveWorkoutPlanAsTemplate,
  applyWorkoutTemplateToClient,
  deleteWorkoutTemplate,
  saveMealPlanAsTemplate,
  applyMealTemplateToClient,
  deleteMealTemplate,
} from "@/lib/templates";

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
  if (!planId) return { error: "Chýba ID plánu." };

  const result = await saveWorkoutPlanAsTemplate(supabase, user.id, planId, name);
  if (result.error) return result;

  revalidatePath("/dashboard/sablony");
  return ok;
}

/** "Uložiť ako šablónu" na detaile jedálničku (`/dashboard/vyziva/jedalnicek/[planId]`). */
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

/** "Použiť pre klienta" — vytvorí bežný koncept plánu zo šablóny a rovno presmeruje do buildera. */
export async function applyWorkoutTemplateAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const templateId = (formData.get("template_id") as string | null) ?? "";
  const clientId = (formData.get("client_id") as string | null) ?? "";
  if (!templateId) return { error: "Chýba šablóna." };
  if (!clientId) return { error: "Vyber klienta." };

  const result = await applyWorkoutTemplateToClient(supabase, user.id, templateId, clientId);
  if (result.error || !result.planId) return { error: result.error ?? "Plán sa nepodarilo vytvoriť." };

  revalidatePath("/dashboard/treningy");
  redirect(`/dashboard/treningy/${result.planId}`);
}

/** "Použiť pre klienta" — jedálničkový variant, meal_plans nemá koncept/publikovanie (viditeľné hneď). */
export async function applyMealTemplateAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const templateId = (formData.get("template_id") as string | null) ?? "";
  const clientId = (formData.get("client_id") as string | null) ?? "";
  if (!templateId) return { error: "Chýba šablóna." };
  if (!clientId) return { error: "Vyber klienta." };

  const result = await applyMealTemplateToClient(supabase, user.id, templateId, clientId);
  if (result.error || !result.planId) return { error: result.error ?? "Jedálniček sa nepodarilo vytvoriť." };

  revalidatePath("/dashboard/vyziva");
  redirect(`/dashboard/vyziva/jedalnicek/${result.planId}`);
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
