import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { INVITE_COOKIE, inviteCookieOptions, isInviteSlug } from "@/lib/invite/pending";
import { isHandleShape, isReservedHandle } from "@/lib/publicPage/handle";
import { buildTrainerPublicUrl, parseTrainerHost, trainerSubdomainBase } from "@/lib/publicPage/subdomain";
import { siteUrl } from "@/lib/site";

/** Adresa hlavnej domény (www). V dev (základ „localhost“) www.localhost s tým istým portom — Next by Location na
 *  vlastný origin (localhost:3000) zmenil na relatívny a presmerovanie zo subdomény by zacyklilo. */
function mainOrigin(request: NextRequest, base: string): string {
  if (base === "localhost") return `${request.nextUrl.protocol}//www.localhost${request.nextUrl.port ? `:${request.nextUrl.port}` : ""}`;
  return siteUrl();
}

/** 308 s absolútnym Location (NextResponse.redirect by v dev pri rovnakom origine z hlavičky zahodil host). */
function permanentRedirect(url: string): NextResponse {
  return new NextResponse(null, { status: 308, headers: { Location: url } });
}

/** Subdomény trénerov (<handle>.<TRAINER_SUBDOMAIN_BASE>) + presmerovanie /t/<handle> z hlavnej domény. Bez Supabase a bez DB. */
function trainerSubdomains(request: NextRequest, base: string): NextResponse | null {
  const { pathname, search } = request.nextUrl;
  const host = parseTrainerHost(request.headers.get("host") ?? request.nextUrl.host, base);

  if (host.kind === "trainer") {
    if (pathname === "/" || pathname === "") return NextResponse.rewrite(new URL(`/t/${host.handle}`, request.url));
    if (pathname === "/og") return NextResponse.rewrite(new URL(`/t/${host.handle}/og`, request.url));
    // čokoľvek iné (aj /prihlasenie, /portal, /t/...) patrí hlavnej doméne
    return permanentRedirect(`${mainOrigin(request, base)}${pathname}${search}`);
  }
  if (host.kind === "invalid") return permanentRedirect(`${mainOrigin(request, base)}/`);
  // hlavná doména (www, holá doména, v dev localhost): /t/<handle> → subdoména trénera
  // (existenciu stránky rieši samotná stránka — 404)
  const hostname = (request.headers.get("host") ?? request.nextUrl.host).toLowerCase().replace(/:\d+$/, "");
  if (host.kind === "www" || hostname === base || (base === "localhost" && hostname === "localhost")) {
    const m = /^\/t\/([^/]+)\/?$/.exec(pathname);
    if (m && isHandleShape(m[1]) && !isReservedHandle(m[1])) {
      return permanentRedirect(buildTrainerPublicUrl(m[1], base, siteUrl()));
    }
  }
  return null;
}

export async function middleware(request: NextRequest) {
  const base = trainerSubdomainBase();
  if (base) {
    const res = trainerSubdomains(request, base);
    if (res) return res;
    // hlavná doména: /t/<handle> bez presmerovania (rezervované/neplatné) nesmie ísť do Supabase
    if (request.nextUrl.pathname.startsWith("/t/")) return NextResponse.next();
  }
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
  // Supabase (updateSession) len pre /dashboard a /portal — nikdy pre verejné stránky ani subdomény.
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/portal")) return await updateSession(request);
  return NextResponse.next();
}

// Hosty subdomén trénerov (okrem www): <čokoľvek>.myfitpilot.sk / <čokoľvek>.localhost (dev). Cesty s príponou súboru
// (obrázky, ikony, fonty, manifest, robots.txt, sitemap.xml…) a _next/brand/… sa nedotýkajú.
export const config = {
  // Predtým bežalo na takmer každej ceste vrátane landing page a /prihlasenie
  // — teda Supabase Auth API round-trip (updateSession volá auth.getUser())
  // pri KAŽDEJ návšteve verejnej marketingovej stránky, aj bez akejkoľvek
  // session. Refresh cookies má zmysel len tam, kde appka reálne beží dlhšie
  // v prihlásenom stave (/dashboard, /portal) — auth guard pre samotný prístup rieši aj tak vlastný
  // getUser() v ich layout.tsx, nie middleware.
  // /pozvanka/:slug: len zapamätanie odkazu pozvánky (viď vyššie), bez Supabase volania.
  // /t/:handle: len presmerovanie na subdoménu trénera (ak je zapnutá), bez Supabase volania.
  // Subdoménový host: lacné rozhodnutie podľa hostu (rewrite/redirect), tiež bez Supabase. Landing `/` na www sa nedotkne.
  matcher: [
    "/dashboard/:path*",
    "/portal/:path*",
    "/pozvanka/:slug",
    "/t/:handle",
    {
      source: "/((?!_next/|_vercel/|brand/|fonts/|wasm/|food-data/|favicon|.*\\.[a-zA-Z0-9]{2,8}$).*)",
      has: [{ type: "host", value: "(?!www\\.)(?:[^.]+\\.)+(?:myfitpilot\\.sk|localhost)(?::\\d+)?" }],
    },
  ],
};
