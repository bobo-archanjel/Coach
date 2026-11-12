import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserLocale } from "@/lib/i18n/server";
import { syncLocaleCookieFromProfile } from "@/lib/i18n/sync";

/**
 * Cieľ OAuth presmerovania (Google/Apple) — Supabase sem po úspešnom overení
 * u providera pošle `code`, ktorý vymeníme za session (PKCE flow @supabase/ssr).
 *
 * `role` prichádza len z registračného formulára (feature/login — Gmail/Apple),
 * kde si používateľ pred kliknutím na "Pokračovať s Google/Apple" zvolil tréner/klient
 * tlačidlom. Prihlásenie existujúceho účtu žiadnu rolu neposiela — tá už je v `profiles`.
 * DB trigger `handle_new_user` pri NOVOM účte vloží rolu `trainer` (default), ak chýba
 * metadata — OAuth signup žiadnu takú metadata nepošle, takže klienta, ktorý sa
 * zaregistroval cez Google/Apple, treba po vytvorení profilu dorobiť na `client`.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const role = searchParams.get("role");
  const providerError = searchParams.get("error_description") ?? searchParams.get("error");

  if (providerError || !code) {
    return NextResponse.redirect(`${origin}/prihlasenie?oauth_error=1`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/prihlasenie?oauth_error=1`);
  }

  const user = data.user;
  // "Nový účet" = vytvorený práve týmto requestom — detekcia cez created_at je jediný
  // spoľahlivý signál bez vlastného stĺpca, keďže OAuth signup a prvé prihlásenie
  // sú z pohľadu Supabase Auth ten istý endpoint (signInWithOAuth).
  const isFreshSignup = Date.now() - new Date(user.created_at).getTime() < 60_000;

  let finalRole: string = "trainer";
  if (isFreshSignup && role === "client") {
    await supabase.from("profiles").update({ role: "client" }).eq("id", user.id);
    finalRole = "client";
  } else {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    finalRole = profile?.role ?? "trainer";
  }

  // Jazyk (feature/cestina): nový účet dostane jazyk, v ktorom sa registroval (cookie /
  // prehliadač); existujúci účet naopak nastaví cookie podľa profilu.
  if (isFreshSignup) {
    const locale = await getUserLocale();
    await supabase.rpc("set_my_locale", { p_locale: locale });
  } else {
    await syncLocaleCookieFromProfile(supabase, user.id);
  }

  if (finalRole === "client") {
    // Rovnaká poistka ako v loginAction — klient musí mať `clients` riadok + kód.
    await supabase.rpc("ensure_self_client");
  }

  return NextResponse.redirect(`${origin}${finalRole === "client" ? "/portal" : "/dashboard"}`);
}
