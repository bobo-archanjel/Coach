"use server";

// Záujemcovia z verejnej stránky: stav, poznámky, pozvánka e-mailom, zmazanie (GDPR).
// Server action je verejný endpoint, takže TU sa overuje všetko: session, rola tréner, trainerBlock
// (read-only účet nič nemení — zmazať záujemcu smie vždy), formát id, povolené prechody stavov a pri pozvánke
// rovnaké limity ako pozvánka v Nastaveniach (reserve_mail_send v sendInviteEmail). Dáta čítajú a menia sa
// cez RLS vlastného trénera (0083), takže cudzí záujemca sa nedá zasiahnuť ani s uhádnutým id.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient, getProfile } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { getMyTrainerBilling, trainerBlock } from "@/lib/billing/server";
import { allowWithinWindow } from "@/lib/rateLimitMemory";
import { dbErr } from "@/lib/dbError";
import { charLength, cleanMultiline } from "@/lib/branding/validation";
import { mailConfigured } from "@/lib/mail/config";
import { sendInviteEmail, type InviteErrorCode } from "@/lib/mail/invite";
import { cleanRecipientName } from "@/lib/mail/sanitize";
import { LEAD_LIMITS_TEXT, canSetStatus, isLeadStatus, statusAfterInvite, type LeadStatus } from "@/lib/publicPage/leads";

export interface LeadActionResult {
  error: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireTrainer(allowReadOnly = false): Promise<{ userId: string; email: string | null; fullName: string } | { error: string }> {
  const t = await getTranslations("publicPage.leads.errors");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notSignedIn") };
  const { data: profile } = await getProfile(user.id);
  if (profile?.role !== "trainer") return { error: t("notTrainer") };
  const blocked = await trainerBlock({ allowReadOnly });
  if (blocked) return { error: blocked };
  return { userId: user.id, email: user.email ?? null, fullName: (profile.full_name as string | null) ?? "" };
}

function refresh(id?: string) {
  revalidatePath("/dashboard/nastavenia");
  revalidatePath("/dashboard/zaujemcovia");
  if (id) revalidatePath(`/dashboard/zaujemcovia/${id}`);
  revalidatePath("/dashboard");
}

export async function setLeadStatusAction(id: string, status: string): Promise<LeadActionResult> {
  const t = await getTranslations("publicPage.leads.errors");
  const guard = await requireTrainer();
  if ("error" in guard) return { error: guard.error };
  if (!UUID.test(id)) return { error: t("notFound") };
  if (!isLeadStatus(status)) return { error: t("invalidStatus") };

  const supabase = await createClient();
  const { data: lead, error: readErr } = await supabase.from("trainer_leads").select("status").eq("id", id).eq("trainer_id", guard.userId).maybeSingle();
  if (readErr) return { error: await dbErr(readErr, "actions") };
  if (!lead) return { error: t("notFound") };
  if (!canSetStatus(lead.status as LeadStatus, status)) return { error: t("invalidStatus") };

  const { error } = await supabase
    .from("trainer_leads")
    .update({ status, status_changed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("trainer_id", guard.userId);
  if (error) return { error: await dbErr(error, "actions") };
  refresh(id);
  return { error: null };
}

export async function saveLeadNotesAction(id: string, notes: string): Promise<LeadActionResult> {
  const t = await getTranslations("publicPage.leads.errors");
  const guard = await requireTrainer();
  if ("error" in guard) return { error: guard.error };
  if (!UUID.test(id)) return { error: t("notFound") };
  const clean = cleanMultiline(notes);
  if (charLength(clean) > LEAD_LIMITS_TEXT.notesMax) return { error: t("notesTooLong") };
  const supabase = await createClient();
  const { data, error } = await supabase.from("trainer_leads").update({ notes: clean }).eq("id", id).eq("trainer_id", guard.userId).select("id");
  if (error) return { error: await dbErr(error, "actions") };
  if (!data || data.length === 0) return { error: t("notFound") };
  refresh(id);
  return { error: null };
}

const INVITE_ERROR_KEY: Record<InviteErrorCode, string> = {
  notConfigured: "mailNotConfigured",
  invalidEmail: "invalidEmail",
  invalidName: "invalidName",
  cooldown: "cooldown",
  hourLimit: "hourLimit",
  dayLimit: "dayLimit",
  globalLimit: "globalLimit",
  sendFailed: "sendFailed",
  unavailable: "unavailable",
};

/** „Poslať pozvánku“ jedným klikom: použije e-mail pozvánky z Nastavení (limity, odhlásenia, značka) a stav záujemcu → pozvaný. */
export async function inviteLeadAction(id: string): Promise<LeadActionResult> {
  const t = await getTranslations("publicPage.leads.errors");
  const guard = await requireTrainer();
  if ("error" in guard) return { error: guard.error };
  if (!UUID.test(id)) return { error: t("notFound") };
  if (!mailConfigured()) return { error: t("mailNotConfigured") };
  if (!allowWithinWindow(`lead-invite:${guard.userId}`, 6, 60_000)) return { error: t("tooFast") };

  const supabase = await createClient();
  const { data: lead, error: readErr } = await supabase.from("trainer_leads").select("name, email, status").eq("id", id).eq("trainer_id", guard.userId).maybeSingle();
  if (readErr) return { error: await dbErr(readErr, "actions") };
  if (!lead) return { error: t("notFound") };

  const admin = tryCreateAdminClient();
  if (!admin) return { error: t("unavailable") };
  const billing = await getMyTrainerBilling(guard.userId);
  // oslovenie krstným menom; ak sa meno nedá použiť v hlavičke/pozdrave, pozvánka ide bez mena
  const first = cleanRecipientName(String(lead.name).split(/\s+/)[0] ?? "");
  const result = await sendInviteEmail(
    admin,
    { id: guard.userId, email: guard.email, fullName: guard.fullName, business: billing.state.features.branding === true },
    lead.email,
    first,
  );
  if (!result.ok) return { error: t(INVITE_ERROR_KEY[result.code] as never) };

  const next = statusAfterInvite(lead.status as LeadStatus);
  const { error } = await supabase
    .from("trainer_leads")
    .update({ status: next, status_changed_at: new Date().toISOString(), invited_at: new Date().toISOString() })
    .eq("id", id)
    .eq("trainer_id", guard.userId);
  if (error) return { error: await dbErr(error, "actions") };
  refresh(id);
  return { error: null };
}

/** Zmazanie záujemcu (GDPR) — smie aj read-only účet. Po zmazaní späť na zoznam. */
export async function deleteLeadAction(id: string): Promise<LeadActionResult> {
  const t = await getTranslations("publicPage.leads.errors");
  const guard = await requireTrainer(true);
  if ("error" in guard) return { error: guard.error };
  if (!UUID.test(id)) return { error: t("notFound") };
  const supabase = await createClient();
  const { error } = await supabase.from("trainer_leads").delete().eq("id", id).eq("trainer_id", guard.userId);
  if (error) return { error: await dbErr(error, "actions") };
  refresh();
  redirect("/dashboard/nastavenia?sekcia=zaujemcovia");
}
