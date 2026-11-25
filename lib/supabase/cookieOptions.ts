import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Voľby pre cookies so Supabase session (`sb-…-auth-token`: access + refresh token);
 * @supabase/ssr ich zlúči s predvolenými (path "/", sameSite "lax", maxAge 400 dní).
 *
 * Secure: cookie s tokenmi nesmie nikdy odísť cez http — HSTS z next.config.ts nepokryje
 * úplne prvú návštevu, takže na ňu sa spoliehať nedá.
 * Len v produkcii (rovnaký vzor ako `inviteCookieOptions` v lib/invite/pending.ts):
 * `npm run dev:mobile` testuje na telefóne cez http://192.168.x.x, kde by prehliadač
 * Secure cookie neuložil a prihlásenie by nefungovalo.
 * httpOnly ostáva false: prehliadačový klient (Realtime chat, notifikácie) číta token
 * z cookie cez document.cookie; httpOnly by ho rozbil.
 *
 * Bez `import "server-only"` — používa to aj prehliadačový klient (Next inlinuje NODE_ENV).
 */
export const SUPABASE_COOKIE_OPTIONS: CookieOptionsWithName = {
  secure: process.env.NODE_ENV === "production",
};
