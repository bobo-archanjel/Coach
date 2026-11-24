// FitPilot — čistenie vstupov pre e-maily (hlavičky, adresy, mená). Čistý modul bez I/O
// (testy: e2e/mail.spec.ts). Používateľský text sa NIKDY nedostane do hlavičky bez prechodu
// cez cleanHeaderText — CR/LF by inak umožnili vložiť ďalšiu hlavičku (header injection).

import { createHmac } from "crypto";

// riadiace znaky vrátane CR/LF/TAB, zero-width a obojsmerné prepisy
// eslint-disable-next-line no-control-regex
const HEADER_BAD_RE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2028\u2029\u2060-\u2069\uFEFF]/g;

/** Text bezpečný do hlavičky (Subject, meno odosielateľa): bez riadiacich znakov, zalomení, `<>"` a so stropom dĺžky. */
export function cleanHeaderText(input: unknown, max = 80): string {
  if (typeof input !== "string") return "";
  const cleaned = input
    .normalize("NFC")
    .replace(HEADER_BAD_RE, " ")
    .replace(/[<>"\\]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return Array.from(cleaned).slice(0, max).join("").trim();
}

export const EMAIL_MAX = 254;

const EMAIL_RE =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,24}$/;

/** Zjednotená adresa (malé písmená, bez medzier) alebo null, ak nie je platná. Len ASCII (IDN musí prísť v punycode). */
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  if (email.length === 0 || email.length > EMAIL_MAX) return null;
  if (!EMAIL_RE.test(email)) return null;
  const [local] = email.split("@");
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null;
  return email;
}

export const RECIPIENT_NAME_MAX = 40;

/** Voliteľné meno príjemcu pozvánky: len písmená, medzery, bodka, apostrof a pomlčka; inak null. */
export function cleanRecipientName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = input.normalize("NFC").replace(HEADER_BAD_RE, " ").replace(/\s{2,}/g, " ").trim();
  if (!name) return null;
  if (Array.from(name).length > RECIPIENT_NAME_MAX) return null;
  if (!/^\p{L}[\p{L} .'’-]*$/u.test(name)) return null;
  return name;
}

/** HMAC-SHA256 adresy (hex) — do DB sa ukladá len toto, nie samotná adresa. */
export function hashRecipient(email: string, secret: string): string {
  return createHmac("sha256", secret).update(`recipient:${email.trim().toLowerCase()}`).digest("hex");
}

/** Escapovanie textu do HTML (obsah aj hodnoty atribútov). */
export function escapeHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
