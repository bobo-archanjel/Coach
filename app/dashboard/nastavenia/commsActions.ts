"use server";

// Komunikácia trénera s klientmi (všetky tarify): uvítacia správa v chate a pozvánka e-mailom.
// Server action je verejný endpoint, takže TU sa overuje všetko: session, rola tréner,
// trainerBlock (read-only účet nič nepošle), validácia vstupu a limity odosielania
// (atómové v DB — reserve_mail_send, 0082). Značka v e-maili je len pri Business.

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient, getProfile } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { getMyTrainerBilling, trainerBlock } from "@/lib/billing/server";
import { allowWithinWindow } from "@/lib/rateLimitMemory";
import { dbErr } from "@/lib/dbError";
import { sendInviteEmail, type InviteErrorCode } from "@/lib/mail/invite";
import { mailConfigured } from "@/lib/mail/config";
import { WELCOME_MESSAGE_MAX, validateWelcomeMessage } from "@/lib/mail/welcome";

export interface WelcomeState {
  error: string | null;
  saved: boolean;
}

export interface InviteEmailState {
  error: string | null;
  sent: boolean;
  /** zostávajúci počet pozvánok teraz (po odoslaní) */
  remaining: number | null;
}

async function requireTrainer(): Promise<{ userId: string; email: string | null; fullName: string } | { error: string }> {
  const t = await getTranslations("branding.comms.errors");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notSignedIn") };
  const { data: profile } = await getProfile(user.id);
  if (profile?.role !== "trainer") return { error: t("notTrainer") };
  const blocked = await trainerBlock();
  if (blocked) return { error: blocked };
  return { userId: user.id, email: user.email ?? null, fullName: (profile.full_name as string | null) ?? "" };
}

export async function saveWelcomeMessageAction(_prev: WelcomeState, formData: FormData): Promise<WelcomeState> {
  const t = await getTranslations("branding.comms.errors");
  const guard = await requireTrainer();
  if ("error" in guard) return { error: guard.error, saved: false };

  const parsed = validateWelcomeMessage(formData.get("welcome_message"));
  if (!parsed.ok) return { error: t(parsed.code, { max: WELCOME_MESSAGE_MAX }), saved: false };
  const enabled = formData.get("enabled") === "1";

  const supabase = await createClient();
  const { error } = await supabase
    .from("trainer_welcome_messages")
    .upsert({ trainer_id: guard.userId, body: parsed.value, enabled, updated_at: new Date().toISOString() }, { onConflict: "trainer_id" });
  if (error) return { error: await dbErr(error, "actions"), saved: false };
  revalidatePath("/dashboard/nastavenia");
  return { error: null, saved: true };
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

export async function sendInviteEmailAction(_prev: InviteEmailState, formData: FormData): Promise<InviteEmailState> {
  const t = await getTranslations("branding.comms.errors");
  const guard = await requireTrainer();
  if ("error" in guard) return { error: guard.error, sent: false, remaining: null };

  if (!mailConfigured()) return { error: t("mailNotConfigured"), sent: false, remaining: null };
  // rýchla ochrana v pamäti (proti dvojkliku a skriptu); autoritatívne limity sú v DB
  if (!allowWithinWindow(`invite-mail:${guard.userId}`, 6, 60_000)) return { error: t("tooFast"), sent: false, remaining: null };

  const admin = tryCreateAdminClient();
  if (!admin) return { error: t("unavailable"), sent: false, remaining: null };

  const billing = await getMyTrainerBilling(guard.userId);
  const result = await sendInviteEmail(
    admin,
    { id: guard.userId, email: guard.email, fullName: guard.fullName, business: billing.state.features.branding === true },
    formData.get("email"),
    formData.get("name"),
  );
  if (!result.ok) return { error: t(INVITE_ERROR_KEY[result.code] as never), sent: false, remaining: null };
  revalidatePath("/dashboard/nastavenia");
  return { error: null, sent: true, remaining: result.remaining };
}
