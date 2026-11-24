/* Čakajúca pozvánka trénera (odkaz /pozvanka/<odkaz>) — čisté pomocné funkcie bez Reactu a
   bez next/headers, aby ich vedeli používať middleware, server actions aj čisté testy.

   Postup: návšteva platného odkazu uloží do cookie `fp_invite` odkaz (middleware.ts); po
   prihlásení portál ponúkne kartu „Pripojiť sa“; až kliknutie zavolá RPC claim_invite (0077).
   Cookie je len pamäť „odkiaľ prišiel“ — nič nespája samo, platnosť odkazu vždy overí DB. */

export const INVITE_COOKIE = "fp_invite";
/** 7 dní — dosť na registráciu s overením e-mailu a návrat k aplikácii. */
export const INVITE_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

const SLUG_RE = /^[a-f0-9]{20}$/;

/** Odkaz pozvánky = 20 malých hex znakov (80 bitov, 0075). */
export function isInviteSlug(value: unknown): value is string {
  return typeof value === "string" && SLUG_RE.test(value);
}

/** Z hodnoty cookie vráti platný odkaz, inak null (podvrhnutá/poškodená hodnota sa ignoruje). */
export function parseInviteCookie(value: string | null | undefined): string | null {
  return isInviteSlug(value) ? value : null;
}

/** httpOnly (JS na stránke ho nevie čítať), Secure v produkcii, Lax (prežije presmerovanie z Google). */
export function inviteCookieOptions(secure = process.env.NODE_ENV === "production") {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: INVITE_COOKIE_MAX_AGE,
  };
}

export type ClaimInviteCode =
  | "paired"
  | "already_paired"
  | "already_has_trainer"
  | "trainer_unavailable"
  | "invalid_invite"
  | "rate_limited"
  | "not_a_client"
  | "not_signed_in"
  | "failed";

/** Výsledok RPC (text pri úspechu / 'invalid_invite') alebo chyba z DB → kód pre UI. */
export function mapClaimInviteResult(data: unknown, errorMessage?: string | null): ClaimInviteCode {
  if (errorMessage) {
    if (errorMessage.includes("too_many_attempts")) return "rate_limited";
    if (errorMessage.includes("already_has_trainer")) return "already_has_trainer";
    if (errorMessage.includes("trainer_unavailable")) return "trainer_unavailable";
    if (errorMessage.includes("invalid_invite")) return "invalid_invite";
    if (errorMessage.includes("not_a_client")) return "not_a_client";
    if (errorMessage.includes("not_authenticated")) return "not_signed_in";
    return "failed";
  }
  if (data === "paired" || data === "already_paired" || data === "invalid_invite") return data;
  return "failed";
}

/** Po týchto kódoch je pozvánka vybavená (úspech alebo definitívna chyba) → cookie sa maže.
 *  `rate_limited` a `failed` cookie ponechajú, aby sa dalo skúsiť znova. */
export function clearsInviteCookie(code: ClaimInviteCode): boolean {
  return (
    code === "paired" ||
    code === "already_paired" ||
    code === "already_has_trainer" ||
    code === "trainer_unavailable" ||
    code === "invalid_invite" ||
    code === "not_a_client"
  );
}

export function isClaimSuccess(code: ClaimInviteCode): boolean {
  return code === "paired" || code === "already_paired";
}
