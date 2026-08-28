"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error: string | null;
}
const ok: ActionState = { error: null };

/**
 * "Ukončiť tréning" — Fáza A (existencia záznamu v workout_logs = deň splnený,
 * viď supabase/migrations/0003_portal_client.sql). RLS už dovoľuje klientovi
 * vkladať vlastné logy (workout_logs_insert_own_client); tréner ich vidí cez
 * workout_logs_select_own_trainer bez ďalšej zmeny.
 */
export async function finishWorkoutAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const dayId = formData.get("day_id") as string | null;
  if (!dayId) return { error: "Chýba deň tréningu." };

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!client) return { error: "Tvoj účet nie je prepojený s trénerom." };

  const { error } = await supabase.from("workout_logs").insert({
    client_id: client.id,
    workout_day_id: dayId,
    entries: [],
  });

  if (error) {
    // unique index (client_id, workout_day_id, performed_on) — dnes už zapísané,
    // netreba to hlásiť ako chybu (napr. druhý klik po pomalej sieti).
    if (error.code === "23505") return ok;
    return { error: error.message };
  }

  revalidatePath("/portal");
  return ok;
}
