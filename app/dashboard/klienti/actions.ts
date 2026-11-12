"use server";

import { tErr } from "@/lib/i18n/serverErrors";
import { revalidatePath } from "next/cache";
import { createClient, getUser } from "@/lib/supabase/server";
import { generateProgressSummary } from "@/lib/ai/progressSummary";
import { dbErr } from "@/lib/dbError";

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
  if (!user) return { error: await tErr("notSignedIn") };

  const clientId = (formData.get("client_id") as string | null) ?? "";
  const body = ((formData.get("body") as string | null) ?? "").trim();
  if (!clientId) return { error: await tErr("missingClient") };
  if (!body) return { error: await tErr("emptyMessage") };
  if (body.length > 4000) return { error: await tErr("messageTooLong") };

  // Overenie vlastníctva klienta — RLS to drží tiež, ale radšej jasná hláška.
  const { data: c } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("trainer_id", user.id)
    .maybeSingle();
  if (!c) return { error: await tErr("notYourClient") };

  const { error } = await supabase.from("messages").insert({
    client_id: clientId,
    sender: "trainer",
    sender_id: user.id,
    body,
  });
  if (error) return { error: await dbErr(error, "actions") };

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
  if (!user) return { error: await tErr("notSignedIn"), sentCount: null };

  const clientIds = formData.getAll("client_id").map(String).filter(Boolean);
  const body = ((formData.get("body") as string | null) ?? "").trim();

  if (clientIds.length === 0) return { error: await tErr("chooseAtLeastOneClient"), sentCount: null };
  if (clientIds.length > MAX_BULK_RECIPIENTS) return { error: await tErr("bulkMax", { max: MAX_BULK_RECIPIENTS }), sentCount: null };
  if (!body) return { error: await tErr("emptyMessage"), sentCount: null };
  if (body.length > 4000) return { error: await tErr("messageTooLong"), sentCount: null };

  const { data: owned } = await supabase.from("clients").select("id").eq("trainer_id", user.id).in("id", clientIds);
  const ownedIds = (owned ?? []).map((c) => c.id);
  if (ownedIds.length === 0) return { error: await tErr("noneOfClientsYours"), sentCount: null };

  const rows = ownedIds.map((clientId) => ({ client_id: clientId, sender: "trainer" as const, sender_id: user.id, body }));
  const { error } = await supabase.from("messages").insert(rows);
  if (error) return { error: await dbErr(error, "actions"), sentCount: null };

  revalidatePath("/dashboard/spravy");
  revalidatePath("/dashboard/klienti/[id]", "page");
  revalidatePath("/dashboard");
  return { error: null, sentCount: ownedIds.length };
}

/**
 * Chat — tréner označí správy od klienta ako prečítané (pri otvorení vlákna / návrate).
 * Najprv lacný count neprečítaných: RPC aj revalidatePath (re-render celej stránky)
 * len keď je naozaj čo označiť — väčšina otvorení / návratov na kartu nemá nič nové.
 * Session overuje lokálne getUser (claims); samotné RPC si účastníka vlákna overí cez
 * auth.uid() (0019), nič sa tým neobchádza.
 */
export async function markTrainerChatSeenAction(clientId: string): Promise<void> {
  const {
    data: { user },
  } = await getUser();
  if (!user || !clientId) return;
  const supabase = await createClient();
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("sender", "client")
    .is("read_at", null);
  if (!count) return;
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
  if (error) return { error: await dbErr(error, "actions") };
  revalidatePath(`/dashboard/klienti/${clientId}`);
  revalidatePath("/dashboard");
  return ok;
}

/** Obnovenie ukončenej spolupráce (0020). */
export async function resumeClientCooperationAction(clientId: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("resume_client_cooperation", { p_client_id: clientId });
  if (error) return { error: await dbErr(error, "actions") };
  revalidatePath(`/dashboard/klienti/${clientId}`);
  revalidatePath("/dashboard");
  return ok;
}

/**
 * Tréner zvolí klientovi aktívny tréningový plán — ten riadi kartu Dnes v portáli
 * (RPC set_client_active_plan, 0056: klient musí patriť trénerovi, plán klientovi
 * a byť zverejnený). Klient si ho môže kedykoľvek prepnúť sám.
 */
export async function setClientActivePlanAction(clientId: string, planId: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_client_active_plan", { p_client_id: clientId, p_plan_id: planId });
  if (error) {
    if (error.message.includes("not_authenticated")) return { error: await tErr("notSignedIn") };
    if (error.message.includes("client_not_found")) return { error: await tErr("notYourClient") };
    if (error.message.includes("plan_not_found")) return { error: await tErr("planNotFoundOrUnpublished") };
    return { error: await dbErr(error, "actions") };
  }
  revalidatePath(`/dashboard/klienti/${clientId}`);
  revalidatePath("/portal", "layout");
  return ok;
}

/** GDPR — tréner požiada o zmazanie klienta (30-dňová grace period, 0018_client_deletion.sql). */
export async function requestClientDeletionAction(clientId: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_client_deletion", { p_client_id: clientId });
  if (error) return { error: await dbErr(error, "actions") };
  revalidatePath(`/dashboard/klienti/${clientId}`);
  revalidatePath("/dashboard");
  return ok;
}

/** GDPR — zrušenie žiadosti o zmazanie počas grace period. */
export async function cancelClientDeletionAction(clientId: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_client_deletion", { p_client_id: clientId });
  if (error) return { error: await dbErr(error, "actions") };
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
  if (!user) return { ...noSummary, error: await tErr("notSignedIn") };

  const clientId = (formData.get("client_id") as string | null) ?? "";
  if (!clientId) return { ...noSummary, error: await tErr("missingClient") };

  const { data: client } = await supabase
    .from("clients")
    .select("id, full_name, goal")
    .eq("id", clientId)
    .eq("trainer_id", user.id)
    .maybeSingle();
  if (!client) return { ...noSummary, error: await tErr("notYourClient") };

  const result = await generateProgressSummary(supabase, {
    trainerId: user.id,
    clientId,
    clientName: client.full_name,
    clientGoal: client.goal,
  });

  if (result.status === "ok") return { summary: result.summary, error: null };
  return { summary: null, error: result.summary };
}

