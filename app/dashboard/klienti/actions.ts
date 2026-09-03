"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error: string | null;
}
const ok: ActionState = { error: null };

/** Chat — tréner odošle správu klientovi (RLS messages_insert, sender='trainer'). */
export async function sendTrainerMessageAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const clientId = (formData.get("client_id") as string | null) ?? "";
  const body = ((formData.get("body") as string | null) ?? "").trim();
  if (!clientId) return { error: "Chýba klient." };
  if (!body) return { error: "Prázdna správa." };
  if (body.length > 4000) return { error: "Správa je príliš dlhá (max 4000 znakov)." };

  // Overenie vlastníctva klienta — RLS to drží tiež, ale radšej jasná hláška.
  const { data: c } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("trainer_id", user.id)
    .maybeSingle();
  if (!c) return { error: "Tento klient nepatrí tebe." };

  const { error } = await supabase.from("messages").insert({
    client_id: clientId,
    sender: "trainer",
    sender_id: user.id,
    body,
  });
  if (error) return { error: error.message };

  revalidatePath(`/dashboard/klienti/${clientId}`);
  revalidatePath("/dashboard");
  return ok;
}

/** Chat — tréner označí správy od klienta ako prečítané (pri otvorení detailu / návrate). */
export async function markTrainerChatSeenAction(clientId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !clientId) return;
  const { error } = await supabase.rpc("mark_messages_read", { p_client_id: clientId });
  if (!error) {
    revalidatePath(`/dashboard/klienti/${clientId}`);
    revalidatePath("/dashboard");
  }
}

/** Ukončenie spolupráce (nie GDPR výmaz) — dáta ostávajú, dá sa kedykoľvek obnoviť (0020). */
export async function endClientCooperationAction(clientId: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("end_client_cooperation", { p_client_id: clientId });
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/klienti/${clientId}`);
  revalidatePath("/dashboard");
  return ok;
}

/** Obnovenie ukončenej spolupráce (0020). */
export async function resumeClientCooperationAction(clientId: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("resume_client_cooperation", { p_client_id: clientId });
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/klienti/${clientId}`);
  revalidatePath("/dashboard");
  return ok;
}

/** GDPR — tréner požiada o zmazanie klienta (30-dňová grace period, 0018_client_deletion.sql). */
export async function requestClientDeletionAction(clientId: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_client_deletion", { p_client_id: clientId });
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/klienti/${clientId}`);
  revalidatePath("/dashboard");
  return ok;
}

/** GDPR — zrušenie žiadosti o zmazanie počas grace period. */
export async function cancelClientDeletionAction(clientId: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_client_deletion", { p_client_id: clientId });
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/klienti/${clientId}`);
  revalidatePath("/dashboard");
  return ok;
}
