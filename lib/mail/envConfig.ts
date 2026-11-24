import { createHmac } from "crypto";
import { normalizeEmail } from "./sanitize";

// FitPilot — čisté čítanie konfigurácie e-mailov z dodaného `env` (testy: e2e/mail.spec.ts).
// Server ho volá cez lib/mail/config.ts (ten pridáva process.env a `server-only`).
// Hodnoty sa nikdy nelogujú ani nevracajú klientovi; UI dostane len boolean „je nastavené“.

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  fromAddress: string;
}

/** SMTP nastavenie, alebo null, ak niečo chýba / je neplatné (odosielanie je vtedy bezpečný no-op). */
export function getSmtpConfig(env: Record<string, string | undefined>): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  const port = Number(env.SMTP_PORT?.trim());
  const user = env.SMTP_USER?.trim();
  const password = env.SMTP_PASSWORD;
  const fromAddress = normalizeEmail(env.MAIL_FROM_ADDRESS);
  if (!host || !user || !password || !fromAddress) return null;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host, port, user, password, fromAddress };
}

export function mailConfigured(env: Record<string, string | undefined>): boolean {
  return getSmtpConfig(env) !== null;
}

/**
 * Tajný kľúč na podpis odkazov odhlásenia a hashovanie adries: MAIL_UNSUBSCRIBE_SECRET, inak odvodený
 * z CRON_SECRET (jeden kľúč na jednu vec — odvodenie cez HMAC s pevným označením). null = nenastavené.
 */
export function getMailSecret(env: Record<string, string | undefined>): string | null {
  const own = env.MAIL_UNSUBSCRIBE_SECRET?.trim();
  if (own && own.length >= 16) return own;
  const cron = env.CRON_SECRET?.trim();
  if (cron && cron.length >= 16) return createHmac("sha256", cron).update("fitpilot-mail-secret-v1").digest("hex");
  return null;
}

/** Základ verejných odkazov (NEXT_PUBLIC_SITE_URL), bez koncového lomítka. */
export function mailSiteUrl(env: Record<string, string | undefined>): string {
  const raw = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (raw && /^https?:\/\//.test(raw)) return raw.replace(/\/+$/, "");
  return "http://localhost:3000";
}
