import "server-only";

// Zdieľané overenie Cloudflare Turnstile pre prihlásenie aj registráciu
// (feature/security) — token z prehliadača sa dá sfalšovať/vynechať, kontrola
// "reťazec existuje" by bot obišiel triviálne, musí sa vždy overiť TU, na serveri.
// Rovnaký Cloudflare Turnstile projekt ako waitlist (supabase/functions/submit-waitlist),
// len iný secret store — tam function secret, tu env premenná Next.js servera.

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileResult {
  ok: boolean;
  /** true = appka beží bez CAPTCHA ochrany (TURNSTILE_SECRET_KEY nie je nastavený) —
   * "best effort" degradácia, rovnaký princíp ako `tryCreateAdminClient()` pre lockout. */
  skipped: boolean;
}

export async function verifyTurnstile(token: string, ip: string | null): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error(
      "verifyTurnstile: TURNSTILE_SECRET_KEY nie je nastavený — appka beží BEZ bot ochrany na prihlásení/registrácii.",
    );
    return { ok: true, skipped: true };
  }
  if (!token) return { ok: false, skipped: false };

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
    });
    const data = await res.json().catch(() => ({ success: false }));
    return { ok: data?.success === true, skipped: false };
  } catch (err) {
    console.error("verifyTurnstile: overenie zlyhalo:", err instanceof Error ? err.message : err);
    return { ok: false, skipped: false };
  }
}

/** Honeypot pole ("hp") — skryté pre ľudí (CSS + tabIndex=-1), primitívny bot,
 * ktorý vyplní každé pole formulára, ho ale nájde a vyplní. */
export function isHoneypotTripped(formData: FormData): boolean {
  const hp = formData.get("hp");
  return typeof hp === "string" && hp.trim() !== "";
}
