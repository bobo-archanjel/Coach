import type { SupabaseClient } from "@supabase/supabase-js";

// Skryté upozornenia klienta (migrácia 0056, client_notification_dismissals) — viď
// lib/portal/attention.ts pre tvar kľúčov. Táto vrstva len číta aktívne skrytia.
// Mirror lib/dashboard/dismissals.ts (tréner), len iná tabuľka/stĺpec.

/**
 * Množina aktuálne skrytých kľúčov (skrytie bez expirácie, alebo s expiráciou v
 * budúcnosti). Chyba dopytu — vrátane "tabuľka ešte neexistuje", kým sa nespustí
 * migrácia 0056 — znamená prázdnu množinu: upozornenia sa ukážu ako doteraz,
 * appka nikdy nespadne kvôli skrývaniu.
 */
export async function getActivePortalDismissals(supabase: SupabaseClient, clientId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("client_notification_dismissals")
    .select("key, dismissed_until")
    .eq("client_id", clientId);
  if (error || !data) return new Set();
  const now = Date.now();
  return new Set(
    data
      .filter((r) => r.dismissed_until == null || new Date(r.dismissed_until as string).getTime() > now)
      .map((r) => r.key as string),
  );
}
