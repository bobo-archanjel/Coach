"use server";

// GDPR — tréner si zmaže celý účet (0062_trainer_deletion.sql): 30-dňová lehota, dá sa
// zrušiť. Po lehote nočná úloha zmaže účet; klientom s vlastným účtom ostanú zverejnené
// plány a jedálničky, správy s trénerom sa zmažú.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dbErr } from "@/lib/dbError";

export interface DeletionState {
  error: string | null;
}

export async function requestTrainerDeletionAction(): Promise<DeletionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_trainer_deletion");
  if (error) return { error: await dbErr(error, "actions") };
  revalidatePath("/dashboard/nastavenia");
  return { error: null };
}

export async function cancelTrainerDeletionAction(): Promise<DeletionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_trainer_deletion");
  if (error) return { error: await dbErr(error, "actions") };
  revalidatePath("/dashboard/nastavenia");
  return { error: null };
}
