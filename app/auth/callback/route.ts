import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserLocale } from "@/lib/i18n/server";
import { syncLocaleCookieFromProfile } from "@/lib/i18n/sync";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { isBrandNewOAuthAccount } from "@/lib/auth/oauthAccount";

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
 * Rolu nejde meniť priamym update profilu (od 0036 zakázané), ale cez RPC
 * `claim_client_role` (0068) — len pre čerstvý účet bez klientov.
 *
 * `mode=login` posiela záložka Prihlásenie. Keď Google pri „prihlásení“ účet práve
 * vytvoril (človek ešte nie je zaregistrovaný), účet sa hneď zmaže a prihlasovacia
 * stránka ukáže „nie si zaregistrovaný“ — registrácia ide len cez záložku Registrácia
 * (výber roly).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const role = searchParams.get("role");
  const isLoginMode = searchParams.get("mode") === "login";
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
  // "Nový účet" = vytvorený práve týmto requestom (created_at ≈ last_sign_in_at, pár
  // sekúnd dozadu) — OAuth signup a prvé prihlásenie sú z pohľadu Supabase Auth ten
  // istý endpoint (signInWithOAuth), vlastný stĺpec na to nemáme.
  const isFreshSignup = isBrandNewOAuthAccount(user);

  if (isLoginMode && isFreshSignup) {
    // Prihlásenie bez účtu: Google ho práve vytvoril → odhlásiť a zmazať (bez service
    // role kľúča aspoň odhlásiť; prázdny trénerský účet potom ostane, zaloguje sa).
    await supabase.auth.signOut();
    const admin = tryCreateAdminClient();
    const { error: deleteError } = admin
      ? await admin.auth.admin.deleteUser(user.id)
      : { error: new Error("chýba service role kľúč") };
    if (deleteError) console.error("[auth/callback] zmazanie neregistrovaného účtu zlyhalo:", deleteError.message);
    return NextResponse.redirect(`${origin}/prihlasenie?oauth_error=not_registered`);
  }

  if (isFreshSignup && role === "client") {
    const { error: roleError } = await supabase.rpc("claim_client_role");
    if (roleError) console.error("[auth/callback] claim_client_role zlyhal:", roleError.message);
  }
  // Rola vždy z DB — ak by zmena zlyhala, nesmie appka tváriť, že je klient.
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const finalRole: string = profile?.role ?? "trainer";

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
