// FitPilot — skladanie a odosielanie e-mailovej správy. Čistý modul (bez nodemailer importu):
// transport sa dodá zvonka, takže testy použijú falošný transport a nič sa reálne nepošle
// (testy: e2e/mail.spec.ts). Reálny SMTP transport je v lib/mail/transport.ts (server-only).

import { cleanHeaderText, normalizeEmail } from "./sanitize";

export interface MailAddress {
  name: string;
  address: string;
}

export interface MailMessage {
  from: MailAddress;
  replyTo?: MailAddress;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
}

export interface MailTransport {
  sendMail(message: MailMessage): Promise<unknown>;
}

/** Zobrazované meno odosielateľa: „<Značka> (FitPilot)“ pre trénera so značkou, inak „FitPilot“. */
export function senderDisplayName(brandName: string | null | undefined): string {
  const brand = cleanHeaderText(brandName, 40);
  if (!brand || brand.toLowerCase() === "fitpilot") return "FitPilot";
  return `${brand} (FitPilot)`;
}

/** Hlavička „From“: adresa je vždy MAIL_FROM_ADDRESS (nikdy adresa od používateľa). */
export function buildFrom(brandName: string | null | undefined, fromAddress: string): MailAddress {
  const address = normalizeEmail(fromAddress);
  if (!address) throw new Error("mail: neplatná MAIL_FROM_ADDRESS");
  return { name: senderDisplayName(brandName), address };
}

/** Reply-To: účet trénera (odpoveď klienta ide priamo jemu); neplatná adresa → žiadna hlavička. */
export function buildReplyTo(trainerEmail: string | null | undefined, trainerName: string | null | undefined): MailAddress | undefined {
  const address = normalizeEmail(trainerEmail);
  if (!address) return undefined;
  return { name: cleanHeaderText(trainerName, 60), address };
}

/** Hlavička v textovej podobe `"Meno" <adresa>` (na logy/testy; nodemailer si ju skladá sám z objektu). */
export function formatAddress(a: MailAddress): string {
  return a.name ? `"${a.name.replace(/(["\\])/g, "\\$1")}" <${a.address}>` : `<${a.address}>`;
}

export interface BuildMessageInput {
  from: MailAddress;
  replyTo?: MailAddress;
  to: string;
  subject: string;
  html: string;
  text: string;
  /** odkaz na odhlásenie (nepovinné e-maily) → List-Unsubscribe + One-Click */
  unsubscribeUrl?: string;
}

export function buildMessage(input: BuildMessageInput): MailMessage {
  const to = normalizeEmail(input.to);
  if (!to) throw new Error("mail: neplatná adresa príjemcu");
  const headers: Record<string, string> = {};
  if (input.unsubscribeUrl) {
    // https odkaz bez zalomení (inak by sa dala vložiť ďalšia hlavička)
    if (!/^https?:\/\/[^\s<>"]+$/.test(input.unsubscribeUrl)) throw new Error("mail: neplatný odkaz odhlásenia");
    headers["List-Unsubscribe"] = `<${input.unsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  // automatické správy: žiadne automatické odpovede (out-of-office) späť
  headers["Auto-Submitted"] = "auto-generated";
  return {
    from: input.from,
    replyTo: input.replyTo,
    to,
    subject: cleanHeaderText(input.subject, 150),
    html: input.html,
    text: input.text,
    headers,
  };
}

export type DeliverResult = { ok: true } | { ok: false; reason: "failed" };

/** Odošle správu cez transport; chyba sa zaloguje (bez adresy príjemcu) a vráti sa ako výsledok, nikdy nie výnimka. */
export async function deliver(transport: MailTransport, message: MailMessage): Promise<DeliverResult> {
  try {
    await transport.sendMail(message);
    return { ok: true };
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "unknown";
    console.error("mail.deliver failed:", code);
    return { ok: false, reason: "failed" };
  }
}
