"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { deliverPlanToRecipients, type PlanKind } from "@/lib/planRecipients";
import { dbErr } from "@/lib/dbError";

const builderPath = (kind: PlanKind, planId: string) =>
  kind === "workout" ? `/dashboard/treningy/${planId}` : `/dashboard/jedalnicky/jedalnicek/${planId}`;

/** Odobrať ďalšieho príjemcu konceptu (šablóna pre viacerých klientov, 0052) — ešte pred odoslaním. */
export async function removePlanRecipientAction(kind: PlanKind, planId: string, clientId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };
  const { error } = await supabase
    .from("plan_recipients")
    .delete()
    .eq(kind === "workout" ? "workout_plan_id" : "meal_plan_id", planId)
    .eq("client_id", clientId)
    .eq("trainer_id", user.id);
  if (error) return { error: dbErr(error, "actions") };
  revalidatePath(builderPath(kind, planId));
  return { error: null };
}

/** Odoslaný plán, ktorý sa niektorým príjemcom nepodarilo doručiť — skúsiť znova. */
export async function sendToRemainingRecipientsAction(kind: PlanKind, planId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };
  const { data: plan } = await supabase
    .from(kind === "workout" ? "workout_plans" : "meal_plans")
    .select("published")
    .eq("id", planId)
    .eq("trainer_id", user.id)
    .maybeSingle();
  if (!plan?.published) return { error: "Plán ešte nie je odoslaný." };
  const delivery = await deliverPlanToRecipients(supabase, user.id, kind, planId);
  revalidatePath(builderPath(kind, planId));
  revalidatePath(kind === "workout" ? "/dashboard/treningy" : "/dashboard/jedalnicky");
  return { error: delivery.error };
}
