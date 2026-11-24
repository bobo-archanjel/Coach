import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBrandingForTrainer } from "@/lib/branding/server";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { getMailSecret, getSmtpConfig, mailSiteUrl } from "./config";
import { INVITE_LIMITS, remainingInvites, type InviteDecision } from "./limits";
import { buildFrom, buildMessage, buildReplyTo } from "./message";
import { cleanRecipientName, hashRecipient, normalizeEmail } from "./sanitize";
import { mailBrandFrom, renderInviteMail } from "./templates";
import { signUnsubToken } from "./token";
import { sendMail } from "./transport";

// FitPilot — odoslanie e-mailovej pozvánky klientovi (server). Volá ho server action po overení
// session + role tréner + trainerBlock (viď app/dashboard/nastavenia/commsActions.ts); táto funkcia
// už dostáva dôveryhodné trainerId. Pozvánku smie poslať každá tarifa; značka (logo, názov, farba,
// odkaz /pozvanka) sa použije len pri Business.

export type InviteErrorCode = "notConfigured" | "invalidEmail" | "invalidName" | "cooldown" | "hourLimit" | "dayLimit" | "globalLimit" | "sendFailed" | "unavailable";

export type InviteResult = { ok: true; remaining: number } | { ok: false; code: InviteErrorCode };

export interface InviteTrainer {
  id: string;
  /** e-mail účtu trénera (Reply-To) */
  email: string | null;
  fullName: string;
  /** tarifa trénera má značku (Business) */
  business: boolean;
}

const DECISION_CODE: Record<Exclude<InviteDecision, "ok">, InviteErrorCode> = {
  recipient_cooldown: "cooldown",
  hour_limit: "hourLimit",
  day_limit: "dayLimit",
  global_limit: "globalLimit",
};

/** Zostávajúce pozvánky trénera (z mail_send_log; zápis a čítanie len service role). */
export async function loadInviteQuota(admin: SupabaseClient, trainerId: string): Promise<{ hour: number; day: number; now: number }> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data, error } = await admin.from("mail_send_log").select("sent_at").eq("trainer_id", trainerId).gte("sent_at", since).limit(200);
  if (error) {
    // tabuľka ešte neexistuje (0082 nebehla) → neukazujeme limit
    return remainingInvites({ hour: 0, day: 0 });
  }
  const hourAgo = Date.now() - 3600_000;
  const rows = (data ?? []) as { sent_at: string }[];
  return remainingInvites({ hour: rows.filter((r) => Date.parse(r.sent_at) > hourAgo).length, day: rows.length });
}

export async function sendInviteEmail(admin: SupabaseClient, trainer: InviteTrainer, rawEmail: unknown, rawName: unknown): Promise<InviteResult> {
  const cfg = getSmtpConfig();
  const secret = getMailSecret();
  if (!cfg || !secret) return { ok: false, code: "notConfigured" };

  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, code: "invalidEmail" };
  const hasName = typeof rawName === "string" && rawName.trim() !== "";
  const name = hasName ? cleanRecipientName(rawName) : null;
  if (hasName && !name) return { ok: false, code: "invalidName" };

  const hash = hashRecipient(email, secret);

  // adresa, ktorá sa odhlásila z pozvánok: tvárime sa, že sa odoslalo (tréner sa nedozvie, kto sa odhlásil)
  const { data: sup, error: supErr } = await admin.from("mail_suppressions").select("recipient_hash").eq("recipient_hash", hash).maybeSingle();
  if (supErr) return { ok: false, code: "unavailable" };
  if (sup) return { ok: true, remaining: (await loadInviteQuota(admin, trainer.id)).now };

  // atómová rezervácia (limity + cooldown príjemcu v jednej transakcii)
  const { data: reserved, error: resErr } = await admin.rpc("reserve_mail_send", {
    p_trainer: trainer.id,
    p_hash: hash,
    p_hour_limit: INVITE_LIMITS.perHour,
    p_day_limit: INVITE_LIMITS.perDay,
    p_cooldown_hours: INVITE_LIMITS.recipientCooldownHours,
    p_global_day_limit: INVITE_LIMITS.globalPerDay,
  });
  if (resErr) {
    console.error("mail.invite reserve:", resErr.message);
    return { ok: false, code: "unavailable" };
  }
  const row = (Array.isArray(reserved) ? reserved[0] : reserved) as { status: string; log_id: string | null } | null;
  if (!row) return { ok: false, code: "unavailable" };
  if (row.status !== "ok" || !row.log_id) {
    return { ok: false, code: DECISION_CODE[row.status as Exclude<InviteDecision, "ok">] ?? "unavailable" };
  }
  const logId = row.log_id;

  try {
    const site = mailSiteUrl();
    const [branding, tb, profile] = await Promise.all([
      trainer.business ? loadBrandingForTrainer(trainer.id) : Promise.resolve(null),
      trainer.business ? admin.from("trainer_branding").select("invite_slug, welcome_text").eq("trainer_id", trainer.id).maybeSingle() : Promise.resolve({ data: null }),
      admin.from("profiles").select("locale").eq("id", trainer.id).maybeSingle(),
    ]);
    const slug = (tb.data as { invite_slug: string | null } | null)?.invite_slug ?? null;
    const branded = trainer.business && !!slug && /^[a-f0-9]{20}$/.test(slug);
    const localeRaw = (profile.data as { locale?: string } | null)?.locale;
    const locale: Locale = isLocale(localeRaw) ? localeRaw : "sk";
    const brand = mailBrandFrom(branding, site);

    const link = branded ? `${site}/pozvanka/${slug}` : `${site}/prihlasenie#register`;
    const unsubscribeUrl = `${site}/api/mail/unsubscribe?t=${encodeURIComponent(signUnsubToken({ k: "invite", s: hash, l: locale }, secret))}`;
    const rendered = renderInviteMail({
      locale,
      brand,
      trainerName: trainer.fullName,
      recipientName: name,
      link,
      branded,
      welcomeText: branding?.welcomeText || undefined,
      unsubscribeUrl,
    });
    const message = buildMessage({
      from: buildFrom(brand.isTrainerBrand ? brand.name : null, cfg.fromAddress),
      replyTo: buildReplyTo(trainer.email, trainer.fullName),
      to: email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      unsubscribeUrl,
    });
    const sent = await sendMail(message);
    if (!sent.ok) {
      // nepodarilo sa → rezerváciu vrátiť, nech sa tréner nepripraví o limit
      await admin.from("mail_send_log").delete().eq("id", logId);
      return { ok: false, code: sent.reason === "not_configured" ? "notConfigured" : "sendFailed" };
    }
    return { ok: true, remaining: (await loadInviteQuota(admin, trainer.id)).now };
  } catch (err) {
    console.error("mail.invite:", err instanceof Error ? err.message : "unknown");
    await admin.from("mail_send_log").delete().eq("id", logId);
    return { ok: false, code: "sendFailed" };
  }
}
