"use server";

// Formulár „Chcem trénovať s tebou“ na verejnej stránke trénera. Server action je verejný endpoint
// BEZ prihlásenia, takže TU sa overuje všetko: honeypot, limit z IP v pamäti, validácia a čistenie
// vstupu, Cloudflare Turnstile (siteverify), viditeľnosť stránky (publikovaná + Business, cez RPC),
// atómové limity v DB (reserve_lead_submit: IP, tréner, duplicita) a až potom zápis cez service role
// (na trainer_leads nie je žiadna INSERT politika pre anon/authenticated).

import { headers } from "next/headers";
import { after } from "next/server";
import { getTranslations } from "next-intl/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { allowWithinWindow } from "@/lib/rateLimitMemory";
import { isHoneypotTripped } from "@/lib/turnstile";
import { verifyTurnstile } from "@/lib/turnstileVerify";
import { TERMS_VERSION } from "@/lib/legal/terms";
import { isHandleShape } from "@/lib/publicPage/handle";
import { LEAD_SUBMIT_LIMITS, validateLead, type LeadSubmitDecision } from "@/lib/publicPage/leads";
import { clientIp, hashValue } from "@/lib/publicPage/ip";
import { sendLeadNotification } from "@/lib/publicPage/leadMail";

export interface LeadFormState {
  error: string | null;
  sent: boolean;
}

const DECISION_KEY: Record<Exclude<LeadSubmitDecision, "ok">, string> = {
  duplicate: "duplicate",
  ip_hour: "tooMany",
  ip_day: "tooMany",
  trainer_hour: "trainerBusy",
  trainer_day: "trainerBusy",
};

export async function submitLeadAction(_prev: LeadFormState, formData: FormData): Promise<LeadFormState> {
  const t = await getTranslations("publicPage.lead.errors");

  // honeypot: bot vyplnil skryté pole → tvárime sa, že sa odoslalo (nič sa neuloží)
  if (isHoneypotTripped(formData)) return { error: null, sent: true };

  const handleRaw = formData.get("handle");
  const handle = typeof handleRaw === "string" ? handleRaw.trim().toLowerCase() : "";
  if (!isHandleShape(handle)) return { error: t("unavailable"), sent: false };

  const ip = clientIp(await headers());
  // rýchla ochrana v pamäti (proti skriptu); autoritatívne limity sú v DB
  if (!allowWithinWindow(`lead-form:${ip}`, 6, 10 * 60_000)) return { error: t("tooMany"), sent: false };

  const parsed = validateLead({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    goal: formData.get("goal"),
    experience: formData.get("experience"),
    availability: formData.get("availability"),
    message: formData.get("message"),
    consent: formData.get("consent"),
  });
  if (!parsed.ok) return { error: t(parsed.code), sent: false };

  // Turnstile až po lacných kontrolách (token je jednorazový a siteverify je sieťové volanie)
  const captcha = await verifyTurnstile(formData.get("turnstile"), ip);
  if (captcha === "failed") return { error: t("captcha"), sent: false };
  if (captcha === "unavailable") return { error: t("unavailable"), sent: false };

  const admin = tryCreateAdminClient();
  if (!admin) return { error: t("unavailable"), sent: false };

  // stránka musí byť teraz viditeľná (publikovaná + Business) — inak rovnaká chyba ako pri výpadku
  const { data: trainerId, error: targetErr } = await admin.rpc("get_public_trainer_target", { p_handle: handle });
  if (targetErr) {
    console.error("publicPage.submitLead target:", targetErr.message);
    return { error: t("unavailable"), sent: false };
  }
  if (typeof trainerId !== "string") return { error: t("unavailable"), sent: false };

  const ipHash = hashValue("ip", ip);
  const { data: reserved, error: resErr } = await admin.rpc("reserve_lead_submit", {
    p_trainer: trainerId,
    p_ip_hash: ipHash,
    p_email_hash: hashValue("email", parsed.value.email),
    p_ip_hour_limit: LEAD_SUBMIT_LIMITS.perIpHour,
    p_ip_day_limit: LEAD_SUBMIT_LIMITS.perIpDay,
    p_trainer_hour_limit: LEAD_SUBMIT_LIMITS.perTrainerHour,
    p_trainer_day_limit: LEAD_SUBMIT_LIMITS.perTrainerDay,
    p_email_cooldown_hours: LEAD_SUBMIT_LIMITS.emailCooldownHours,
  });
  if (resErr) {
    console.error("publicPage.submitLead reserve:", resErr.message);
    return { error: t("unavailable"), sent: false };
  }
  const row = (Array.isArray(reserved) ? reserved[0] : reserved) as { status: string; attempt_id: string | null } | null;
  if (!row) return { error: t("unavailable"), sent: false };
  if (row.status !== "ok" || !row.attempt_id) {
    const key = DECISION_KEY[row.status as Exclude<LeadSubmitDecision, "ok">];
    return { error: t((key ?? "unavailable") as "unavailable"), sent: false };
  }

  const v = parsed.value;
  const { error: insErr } = await admin.from("trainer_leads").insert({
    trainer_id: trainerId,
    name: v.name,
    email: v.email,
    phone: v.phone,
    goal: v.goal,
    experience: v.experience,
    availability: v.availability,
    message: v.message,
    consent_version: TERMS_VERSION,
    consent_at: new Date().toISOString(),
    ip_hash: ipHash,
  });
  if (insErr) {
    console.error("publicPage.submitLead insert:", insErr.message);
    // rezervácia limitu sa vráti, nech chyba servera nepripraví návštevníka o pokus
    await admin.from("trainer_lead_attempts").delete().eq("id", row.attempt_id);
    return { error: t("unavailable"), sent: false };
  }

  // e-mail trénerovi až po odoslaní odpovede (zvonček v appke berie počet z DB, e-mail je bonus)
  after(() => sendLeadNotification(admin, trainerId, v));
  return { error: null, sent: true };
}
