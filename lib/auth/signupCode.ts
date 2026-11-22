/**
 * Overenie e-mailu kódom pri registrácii (feature/overenie-kodom): Supabase pošle v šablóne
 * „Confirm signup“ kód `{{ .Token }}` (docs/email-templates), klient ho zadá v appke
 * (app/prihlasenie — VerifyCodeStep). Dĺžka kódu = „Email OTP Length“ v Supabase (Auth →
 * Providers → Email) — musí sedieť s touto konštantou.
 */
export const SIGNUP_CODE_LENGTH = 6;

/** Len číslice, najviac SIGNUP_CODE_LENGTH (vloženie „123 456“ / „123-456“ z e-mailu). */
export function normalizeSignupCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, SIGNUP_CODE_LENGTH);
}

export function isCompleteSignupCode(code: string): boolean {
  return new RegExp(`^\\d{${SIGNUP_CODE_LENGTH}}$`).test(code);
}

/** Kľúč v sessionStorage — rozpracované overenie prežije refresh (`/prihlasenie?overenie=1`). */
export const PENDING_VERIFY_KEY = "fitpilot.verify.email.v1";
