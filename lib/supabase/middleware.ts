import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Obnovuje Supabase session cookies pri každom requeste (štandardný @supabase/ssr vzor).
 * Bez tohto by prihlásenému používateľovi po expirácii access tokenu vypadla session
 * bez varovania namiesto tichého refreshu na pozadí.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        },
      },
    }
  );

  // Nutné volanie (aj bez použitia výsledku) — obnoví token a nastaví cookies do response.
  // getClaims (nie getUser): projekt podpisuje JWT asymetricky (ES256), takže podpis sa
  // overí lokálne voči cachovanému JWKS — bez round-tripu na Supabase Auth pri KAŽDOM
  // kliknutí v appke. Expirovaný token obnoví rovnako ako getUser; pri symetrickom
  // (HS256) kľúči auth-js sám spadne späť na getUser.
  await supabase.auth.getClaims();

  return supabaseResponse;
}
