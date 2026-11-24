import "server-only";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { getSmtpConfig } from "./config";
import { deliver, type DeliverResult, type MailMessage, type MailTransport } from "./message";

// FitPilot — SMTP transport (nodemailer). Pripojenia sa zdieľajú (pool) a majú krátke timeouty,
// aby zlý SMTP server nezablokoval request ani cron. Bez nastavenia SMTP sa odoslanie len zaloguje
// a vráti "not_configured" — appka nikdy nespadne kvôli e-mailu.

let cached: { transporter: Transporter; key: string } | null = null;

function getTransporter(): Transporter | null {
  const cfg = getSmtpConfig();
  if (!cfg) return null;
  const key = `${cfg.host}:${cfg.port}:${cfg.user}`;
  if (cached && cached.key === key) return cached.transporter;
  cached = {
    key,
    transporter: nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      // 465 = implicitné TLS; ostatné porty vyžadujú STARTTLS (nikdy nešifrované spojenie)
      secure: cfg.port === 465,
      requireTLS: cfg.port !== 465,
      auth: { user: cfg.user, pass: cfg.password },
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    }),
  };
  return cached.transporter;
}

/** Adresa odosielateľa (MAIL_FROM_ADDRESS) alebo null, ak SMTP nie je nastavené. */
export function mailFromAddress(): string | null {
  return getSmtpConfig()?.fromAddress ?? null;
}

export type SendResult = DeliverResult | { ok: false; reason: "not_configured" };

/** Odošle správu cez SMTP; bez konfigurácie je to zalogovaný no-op. Nikdy nevyhodí výnimku. */
export async function sendMail(message: MailMessage, transport?: MailTransport): Promise<SendResult> {
  const t = transport ?? getTransporter();
  if (!t) {
    console.warn("mail.sendMail: SMTP nie je nastavené, e-mail sa neodoslal");
    return { ok: false, reason: "not_configured" };
  }
  return deliver(t, message);
}
