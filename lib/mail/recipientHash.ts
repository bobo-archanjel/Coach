import { createHmac } from "crypto";

// Zámerne mimo ./sanitize: sanitize.ts importujú aj klientske komponenty (normalizeEmail, RECIPIENT_NAME_MAX)
// a import "crypto" by do prehliadačového balíka natiahol polyfill Node crypto (~100 kB gzip).

/** HMAC-SHA256 adresy (hex) — do DB sa ukladá len toto, nie samotná adresa. */
export function hashRecipient(email: string, secret: string): string {
  return createHmac("sha256", secret).update(`recipient:${email.trim().toLowerCase()}`).digest("hex");
}
