import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { INVITE_COOKIE, inviteCookieOptions, isInviteSlug } from "@/lib/invite/pending";

export async function middleware(request: NextRequest) {
  // Pozvánka trénera: návšteva /pozvanka/<odkaz> si zapamätá odkaz v httpOnly cookie, aby po
  // registrácii/prihlásení (aj cez Google a overenie e-mailu) portál ponúkol „Pripojiť sa“.
  // Cookie sa nastavuje len pre správny tvar odkazu; či odkaz naozaj platí, rozhoduje stránka
  // (404) a pri spárovaní databáza (claim_invite). Session sa tu netýka — nič nevolá na Auth.
  if (request.nextUrl.pathname.startsWith("/pozvanka/")) {
    const slug = request.nextUrl.pathname.split("/")[2];
    const response = NextResponse.next({ request });
    if (isInviteSlug(slug)) response.cookies.set(INVITE_COOKIE, slug, inviteCookieOptions());
    return response;
  }
  return await updateSession(request);
}

export const config = {
  // Predtým bežalo na takmer každej ceste vrátane landing page a /prihlasenie
  // — teda Supabase Auth API round-trip (updateSession volá auth.getUser())
  // pri KAŽDEJ návšteve verejnej marketingovej stránky, aj bez akejkoľvek
  // session. Refresh cookies má zmysel len tam, kde appka reálne beží dlhšie
  // v prihlásenom stave (/dashboard, /portal) — auth guard pre samotný prístup rieši aj tak vlastný
  // getUser() v ich layout.tsx, nie middleware.
  // /pozvanka/:slug: len zapamätanie odkazu pozvánky (viď vyššie), bez Supabase volania.
  matcher: ["/dashboard/:path*", "/portal/:path*", "/pozvanka/:slug"],
};
