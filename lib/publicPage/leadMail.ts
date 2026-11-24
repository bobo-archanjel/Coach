import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSmtpConfig, mailSiteUrl } from "@/lib/mail/config";
import { buildFrom, buildMessage, buildReplyTo } from "@/lib/mail/message";
import { renderLeadMail } from "@/lib/mail/templates";
import { sendMail } from "@/lib/mail/transport";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import type { LeadInput } from "./leads";

/**
 * E-mail trénerovi o novom záujemcovi (adresa z jeho účtu). Bez nastaveného SMTP je to zalogovaný no-op
 * (sendMail), nikdy nevyhodí výnimku — záujemca je v tom čase už uložený, e-mail je len bonus k zvončeku.
 * Počet e-mailov je prirodzene ohraničený limitmi formulára (reserve_lead_submit: max. 10/hod a 40/deň na trénera).
 * Odpoveď (Reply-To) ide priamo záujemcovi.
 */
export async function sendLeadNotification(admin: SupabaseClient, trainerId: string, lead: LeadInput): Promise<void> {
  try {
    const cfg = getSmtpConfig();
    if (!cfg) return;
    const [{ data: userRes }, { data: profile }] = await Promise.all([
      admin.auth.admin.getUserById(trainerId),
      admin.from("profiles").select("full_name, locale").eq("id", trainerId).maybeSingle(),
    ]);
    const to = userRes?.user?.email;
    if (!to) return;
    const localeRaw = (profile as { locale?: string } | null)?.locale;
    const locale: Locale = isLocale(localeRaw) ? localeRaw : "sk";
    const site = mailSiteUrl();
    const rendered = renderLeadMail(
      { locale, trainerName: ((profile as { full_name?: string | null } | null)?.full_name ?? "").trim(), lead, link: `${site}/dashboard/zaujemcovia` },
      site,
    );
    const message = buildMessage({
      from: buildFrom(null, cfg.fromAddress),
      replyTo: buildReplyTo(lead.email, lead.name),
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    await sendMail(message);
  } catch (err) {
    console.error("publicPage.sendLeadNotification:", err instanceof Error ? err.message : "unknown");
  }
}
