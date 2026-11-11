import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from "./locales";

/**
 * Po prihlásení (loginAction, OAuth callback): jazyk z profilu → cookie, nech appka
 * hovorí jazykom účtu na každom zariadení. Samostatný dopyt — bez migrácie 0059
 * (stĺpec chýba) sa ticho nič nestane a ostane jazyk z cookie / prehliadača.
 * Volať len v server action alebo route handleri (zapisuje cookie).
 */
export async function syncLocaleCookieFromProfile(supabase: SupabaseClient, userId: string): Promise<Locale | null> {
  const { data, error } = await supabase.from("profiles").select("locale").eq("id", userId).maybeSingle();
  const locale = error ? null : (data as { locale?: unknown } | null)?.locale;
  if (!isLocale(locale)) return null;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, { maxAge: LOCALE_COOKIE_MAX_AGE, path: "/", sameSite: "lax" });
  return locale;
}
