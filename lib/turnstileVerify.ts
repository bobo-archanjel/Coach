import "server-only";

// FitPilot — serverové overenie tokenu Cloudflare Turnstile (siteverify) pre verejné formuláre mimo
// Supabase Auth (napr. formulár záujemcu na stránke trénera). Prihlásenie/registráciu overuje Supabase
// sám (viď lib/turnstile.ts) — tento helper je len pre naše vlastné server actions.
// Tajný kľúč: TURNSTILE_SECRET_KEY (len server, nikdy NEXT_PUBLIC_). Token je jednorazový.

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult = "ok" | "failed" | "unavailable";

/**
 * "ok" = token platný; "failed" = neplatný/chýba (bot, vypršal); "unavailable" = overenie sa nedá
 * (chýba tajný kľúč v produkcii, Cloudflare nedostupný) — volajúci formulár v tom prípade ODMIETNE
 * (fail-closed), aby sa ochrana nedala obísť vypnutím služby. V `next dev` bez kľúča sa overenie
 * preskočí, nech sa dá formulár skúšať lokálne.
 */
export async function verifyTurnstile(token: unknown, ip: string | null, env: Record<string, string | undefined> = process.env): Promise<TurnstileResult> {
  const secret = env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    if (env.NODE_ENV === "development") return "ok";
    console.error("turnstile.verify: TURNSTILE_SECRET_KEY nie je nastavený");
    return "unavailable";
  }
  if (typeof token !== "string" || token.length < 10 || token.length > 2048) return "failed";
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok) return "unavailable";
    const json = (await res.json()) as { success?: boolean };
    return json.success === true ? "ok" : "failed";
  } catch (err) {
    console.error("turnstile.verify:", err instanceof Error ? err.message : "unknown");
    return "unavailable";
  }
}
