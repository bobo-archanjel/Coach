import { createBrowserClient } from "@supabase/ssr";

/** Supabase klient pre použitie v "use client" komponentoch (browser). */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Browser klient pre Realtime odbery (`postgres_changes`): počká na token prihláseného
 * používateľa, aby ho kanál poslal už pri pripojení.
 *
 * Session z cookie sa načíta asynchrónne. Kanál pripojený hneď po `createClient()` ide ako
 * rola `anon` a server odber odmietne (RLS; pri filtri `sender=eq.…` chybou „invalid column
 * for filter“). Token, ktorý dorazí počas pripájania, už realtime-js do kanála nepošle,
 * takže udalosti by nikdy neprišli.
 */
export async function createRealtimeClient() {
  const supabase = createClient();
  // Pri chybe sa kanál pripojí aj tak (bez tokenu); záložné obnovovanie volajúcich ostáva.
  await supabase.realtime.setAuth().catch(() => {});
  return supabase;
}
