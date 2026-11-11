"use server";

import { cookies } from "next/headers";
import { createClient, getUser } from "@/lib/supabase/server";
import { isLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "./locales";

export interface SetLocaleResult {
  ok: boolean;
  /** prihlásený používateľ — jazyk sa má uložiť aj do účtu */
  signedIn: boolean;
  /** uložené do profilu (platí na každom zariadení) */
  savedToAccount: boolean;
}

/**
 * Zmena jazyka (Nastavenia trénera, Profil klienta, prepínač na úvodnej stránke).
 * Cookie platí hneď (aj bez prihlásenia); prihlásenému sa jazyk uloží do profilu
 * (0059, RPC set_my_locale) a do user_metadata — podľa neho sa vyberá jazyk e-mailov
 * (Supabase šablóny, docs/email-templates). Bez migrácie 0059 ostane len cookie.
 * Volajúci potom zavolá router.refresh(), nech sa serverové texty vykreslia nanovo.
 */
export async function setLocaleAction(next: unknown): Promise<SetLocaleResult> {
  if (!isLocale(next)) return { ok: false, signedIn: false, savedToAccount: false };

  const store = await cookies();
  store.set(LOCALE_COOKIE, next, { maxAge: LOCALE_COOKIE_MAX_AGE, path: "/", sameSite: "lax" });

  const {
    data: { user },
  } = await getUser();
  if (!user) return { ok: true, signedIn: false, savedToAccount: false };

  const supabase = await createClient();
  const [{ error }, { error: metaError }] = await Promise.all([
    supabase.rpc("set_my_locale", { p_locale: next }),
    supabase.auth.updateUser({ data: { locale: next } }),
  ]);
  if (error) console.error("setLocaleAction:", error.message);
  if (metaError) console.error("setLocaleAction (metadata):", metaError.message);
  return { ok: true, signedIn: true, savedToAccount: !error };
}
