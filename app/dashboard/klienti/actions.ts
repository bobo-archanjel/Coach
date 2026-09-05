"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateProgressSummary } from "@/lib/ai/progressSummary";

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
  revalidatePath("/dashboard/spravy");
  return ok;
}

export interface BulkMessageState {
  error: string | null;
  sentCount: number | null;
}
const MAX_BULK_RECIPIENTS = 200;

/**
 * Hromadná správa (feature/planing-groupMessage) — jeden batch INSERT namiesto
 * N samostatných requestov (jeden na klienta by bol zbytočný N-násobný round-trip).
 * Ownership sa overuje explicitne pre všetky vybrané ID naraz (nie per-riadok) —
 * ak niektoré ID nepatrí trénerovi (napr. upravené DevTools), jednoducho sa
 * vynechá namiesto pádu celej akcie.
 */
export async function bulkSendTrainerMessageAction(_prevState: BulkMessageState, formData: FormData): Promise<BulkMessageState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený.", sentCount: null };

  const clientIds = formData.getAll("client_id").map(String).filter(Boolean);
  const body = ((formData.get("body") as string | null) ?? "").trim();

  if (clientIds.length === 0) return { error: "Vyber aspoň jedného klienta.", sentCount: null };
  if (clientIds.length > MAX_BULK_RECIPIENTS) return { error: `Naraz sa dá poslať max ${MAX_BULK_RECIPIENTS} klientom.`, sentCount: null };
  if (!body) return { error: "Prázdna správa.", sentCount: null };
  if (body.length > 4000) return { error: "Správa je príliš dlhá (max 4000 znakov).", sentCount: null };

  const { data: owned } = await supabase.from("clients").select("id").eq("trainer_id", user.id).in("id", clientIds);
  const ownedIds = (owned ?? []).map((c) => c.id);
  if (ownedIds.length === 0) return { error: "Žiadny z vybraných klientov nepatrí tebe.", sentCount: null };

  const rows = ownedIds.map((clientId) => ({ client_id: clientId, sender: "trainer" as const, sender_id: user.id, body }));
  const { error } = await supabase.from("messages").insert(rows);
  if (error) return { error: error.message, sentCount: null };

  revalidatePath("/dashboard/spravy");
  revalidatePath("/dashboard/klienti/[id]", "page");
  revalidatePath("/dashboard");
  return { error: null, sentCount: ownedIds.length };
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
    revalidatePath("/dashboard/spravy");
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

export interface ProgressSummaryState {
  summary: string | null;
  error: string | null;
}
const noSummary: ProgressSummaryState = { summary: null, error: null };

/**
 * AI sumarizácia progresu (on-demand, žiadny cron) — viď lib/ai/progressSummary.ts.
 * Ownership klienta sa overuje TU (rovnaký vzor ako ostatné akcie) predtým, než sa
 * čokoľvek pošle modelu — `generateProgressSummary` samo autorizáciu nerobí.
 */
export async function generateProgressSummaryAction(
  _prevState: ProgressSummaryState,
  formData: FormData,
): Promise<ProgressSummaryState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ...noSummary, error: "Nie si prihlásený." };

  const clientId = (formData.get("client_id") as string | null) ?? "";
  if (!clientId) return { ...noSummary, error: "Chýba klient." };

  const { data: client } = await supabase
    .from("clients")
    .select("id, full_name, goal")
    .eq("id", clientId)
    .eq("trainer_id", user.id)
    .maybeSingle();
  if (!client) return { ...noSummary, error: "Tento klient nepatrí tebe." };

  const result = await generateProgressSummary(supabase, {
    trainerId: user.id,
    clientId,
    clientName: client.full_name,
    clientGoal: client.goal,
  });

  if (result.status === "ok") return { summary: result.summary, error: null };
  return { summary: null, error: result.summary };
}

