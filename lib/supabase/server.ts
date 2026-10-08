import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cache } from "react";

/**
 * Supabase klient pre Server Components / Server Actions / Route Handlers.
 * `cache()` dedupuje volania v rámci JEDNÉHO requestu (React request-scoped
 * memoizácia) — layout aj vnorená stránka volajú `createClient()` nezávisle
 * od seba, bez tohto by dostali dva rôzne inštancie zbytočne (samotné
 * vytvorenie je lacné, ide o to, aby `getUser()` nižšie malo čo dedupovať).
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // setAll volané zo Server Component — middleware sa postará o refresh session.
          }
        },
      },
    }
  );
});

/**
 * Overenie prihláseného používateľa (token sa overuje podpisom, nie len lokálnym
 * decode — viď getClaims nižšie). `getUser()` s sieťovým volaním layout aj stránka predtým
 * volali každý samostatne (2-3× za jeden request, plus raz v middleware, ktoré
 * beží mimo React stromu a dedupovať sa nedá) — zmerané ~150-250ms na volanie,
 * čo pri 2-3 zbytočných opakovaniach spolu s ďalšími sekvenčnými dopytmi dávalo
 * dokopy sekundy navyše na každý klik. `cache()` zaisťuje, že v rámci jedného
 * requestu (layout + stránka) sa skutočné sieťové volanie spraví len raz.
 */
export const getUser = cache(async () => {
  const supabase = await createClient();
  // getClaims overí podpis JWT lokálne (projekt má asymetrický ES256 kľúč, JWKS sa
  // cachuje) — ušetrí sieťový round-trip na Supabase Auth pri každej navigácii.
  // Stránky a layouty z `user` čítajú len id, email a user_metadata, a tie sú
  // priamo v claims. Server actions (zápisy) volajú naďalej priamo
  // supabase.auth.getUser(), ktoré overuje session aj proti serveru.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (claims?.sub) {
    const user = {
      id: claims.sub,
      email: claims.email,
      user_metadata: claims.user_metadata ?? {},
      app_metadata: claims.app_metadata ?? {},
      aud: Array.isArray(claims.aud) ? claims.aud[0] : claims.aud,
      role: claims.role,
    } as unknown as User;
    return { data: { user }, error: null };
  }
  return supabase.auth.getUser();
});

/**
 * `profiles` riadok pre daného používateľa — layout (role, pre redirect guard)
 * aj `lib/portal/data.ts` (full_name, pre pozdrav/meno) doťahovali ten istý
 * riadok samostatne, dvomi round-tripmi za request. `cache()` kľúčovaný podľa
 * `userId` ich zlúči na jeden dopyt so všetkými stĺpcami, ktoré niekto z nich
 * potrebuje.
 */
export const getProfile = cache(async (userId: string) => {
  const supabase = await createClient();
  return supabase.from("profiles").select("role, full_name").eq("id", userId).maybeSingle();
});
