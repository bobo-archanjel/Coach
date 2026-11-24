"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient, getUser } from "@/lib/supabase/server";
import {
  INVITE_COOKIE,
  clearsInviteCookie,
  isClaimSuccess,
  mapClaimInviteResult,
  parseInviteCookie,
  type ClaimInviteCode,
} from "@/lib/invite/pending";

export interface ClaimInviteState {
  ok: boolean;
  code: ClaimInviteCode;
  message: string;
}

const ERROR_KEY: Record<Exclude<ClaimInviteCode, "paired" | "already_paired">, string> = {
  already_has_trainer: "alreadyHasTrainer",
  trainer_unavailable: "trainerUnavailable",
  invalid_invite: "invalidInvite",
  rate_limited: "rateLimited",
  not_a_client: "notAClient",
  not_signed_in: "notSignedIn",
  failed: "failed",
};

/**
 * Klient klikol „Pripojiť sa“ — spáruje sa s trénerom z cookie `fp_invite` cez RPC claim_invite
 * (0077). Odkaz sa berie VÝHRADNE z httpOnly cookie (nie z argumentu), takže sa nedá podstrčiť
 * cudzí odkaz; pairing sa deje len na tento explicitný krok. Cookie sa maže po úspechu aj po
 * definitívnej chybe; pri limite pokusov a výpadku ostáva, nech sa dá skúsiť znova.
 */
export async function claimInviteAction(): Promise<ClaimInviteState> {
  const t = await getTranslations("branding.invitePairing");
  const fail = (code: ClaimInviteCode): ClaimInviteState => ({
    ok: false,
    code,
    message: (t as unknown as (k: string) => string)(`errors.${ERROR_KEY[code as keyof typeof ERROR_KEY]}`),
  });

  const store = await cookies();
  const slug = parseInviteCookie(store.get(INVITE_COOKIE)?.value);
  if (!slug) {
    store.delete(INVITE_COOKIE);
    return fail("invalid_invite");
  }

  const {
    data: { user },
  } = await getUser();
  if (!user) return fail("not_signed_in");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_invite", { p_slug: slug });
  if (error) console.error("claimInviteAction:", error.message);
  const code = mapClaimInviteResult(data, error?.message);

  if (clearsInviteCookie(code)) store.delete(INVITE_COOKIE);

  if (isClaimSuccess(code)) {
    revalidatePath("/portal", "layout");
    return { ok: true, code, message: t("success") };
  }
  return fail(code);
}

/** „Nie, ďakujem“ — zahodí zapamätanú pozvánku (nič sa nespáruje). */
export async function dismissInviteAction(): Promise<void> {
  (await cookies()).delete(INVITE_COOKIE);
}
