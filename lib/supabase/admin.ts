import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role klient — VÝHRADNE pre serverový kód, ktorý musí robiť veci, ktoré
 * bežný používateľ nesmie (lockout prihlásenia, rezervácia AI limitov, zápis
 * odpovedí AI asistenta). Obchádza RLS úplne, preto:
 *  - `import "server-only"` zaručí, že sa build zlomí, ak by sa ho niekto pokúsil
 *    importovať do klientskej komponenty (kľúč by sa dostal do prehliadača),
 *  - kľúč nikdy nemá prefix NEXT_PUBLIC_,
 *  - každé volanie musí mať vlastný explicitný filter/overenie (rovnaká disciplína
 *    ako pri SECURITY DEFINER funkciách),
 *  - nikdy sa nepoužije na čítanie/zápis dát v mene používateľa bez toho, aby server
 *    najprv overil session a vlastníctvo (getUser + dopyt cez bežný klient).
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("createAdminClient: chýba NEXT_PUBLIC_SUPABASE_URL alebo SUPABASE_SERVICE_ROLE_KEY");
  }
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Ako createAdminClient, ale `null` namiesto výnimky — pre miesta, kde má appka degradovať, nie spadnúť. */
export function tryCreateAdminClient(): SupabaseClient | null {
  try {
    return createAdminClient();
  } catch (err) {
    console.error("tryCreateAdminClient:", err instanceof Error ? err.message : err);
    return null;
  }
}
