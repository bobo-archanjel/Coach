import "server-only";
import { getMailSecret as secret, getSmtpConfig as smtp, mailSiteUrl as site, type SmtpConfig } from "./envConfig";

// FitPilot — konfigurácia odosielania e-mailov z premenných prostredia (len server).
// Hodnoty sa nikdy nelogujú ani nevracajú klientovi; UI dostane len boolean „je nastavené“.

export type { SmtpConfig };

/** SMTP nastavenie, alebo null, ak niečo chýba / je neplatné (odosielanie je vtedy bezpečný no-op). */
export const getSmtpConfig = (env: Record<string, string | undefined> = process.env): SmtpConfig | null => smtp(env);

export const mailConfigured = (env: Record<string, string | undefined> = process.env): boolean => smtp(env) !== null;

/** Tajný kľúč odhlasovacích odkazov a hashov adries (MAIL_UNSUBSCRIBE_SECRET, inak odvodený z CRON_SECRET). */
export const getMailSecret = (env: Record<string, string | undefined> = process.env): string | null => secret(env);

/** Základ verejných odkazov (NEXT_PUBLIC_SITE_URL), bez koncového lomítka. */
export const mailSiteUrl = (env: Record<string, string | undefined> = process.env): string => site(env);
