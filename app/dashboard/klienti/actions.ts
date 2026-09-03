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

function optionalNum(v: FormDataEntryValue | null, min: number, max: number): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

/**
 * Progres — tréner zapíše meranie klienta (váha + obvody, 0023_body_metrics.sql).
 * Jeden záznam na deň (unique client_id+measured_on) — druhé meranie ten istý
 * deň prepíše prvé (upsert), nie duplicitný riadok.
 */
export async function addBodyMetricAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nie si prihlásený." };

  const clientId = (formData.get("client_id") as string | null) ?? "";
  if (!clientId) return { error: "Chýba klient." };

  const measuredOn = (formData.get("measured_on") as string | null) || new Date().toISOString().slice(0, 10);
  const weightKg = optionalNum(formData.get("weight_kg"), 20, 400);
  const waistCm = optionalNum(formData.get("waist_cm"), 20, 250);
  const chestCm = optionalNum(formData.get("chest_cm"), 20, 250);
  const hipsCm = optionalNum(formData.get("hips_cm"), 20, 250);
  const armCm = optionalNum(formData.get("arm_cm"), 5, 100);
  const thighCm = optionalNum(formData.get("thigh_cm"), 5, 150);

  if (weightKg == null && waistCm == null && chestCm == null && hipsCm == null && armCm == null && thighCm == null) {
    return { error: "Zadaj aspoň jednu hodnotu." };
  }

  const { error } = await supabase.from("body_metrics").upsert(
    {
      client_id: clientId,
      trainer_id: user.id,
      measured_on: measuredOn,
      weight_kg: weightKg,
      waist_cm: waistCm,
      chest_cm: chestCm,
      hips_cm: hipsCm,
      arm_cm: armCm,
      thigh_cm: thighCm,
    },
    { onConflict: "client_id,measured_on" },
  );
  if (error) return { error: error.message };

  revalidatePath(`/dashboard/klienti/${clientId}`);
  revalidatePath("/dashboard/analytika");
  return ok;
}
