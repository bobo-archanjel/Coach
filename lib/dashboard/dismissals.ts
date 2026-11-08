import type { SupabaseClient } from "@supabase/supabase-js";

// Skrytá upozornenia trénera (migrácia 0035, notification_dismissals) — viď
// lib/dashboard/attention.ts pre tvar kľúčov. Táto vrstva len číta aktívne skrytia.

/**
 * Množina aktuálne skrytých kľúčov (skrytie bez expirácie, alebo s expiráciou v
 * budúcnosti). Chyba dopytu — vrátane "tabuľka ešte neexistuje", kým sa nespustí
 * migrácia 0035 — znamená prázdnu množinu: upozornenia sa ukážu ako doteraz,
 * appka nikdy nespadne kvôli skrývaniu.
 */
export async function getActiveDismissals(supabase: SupabaseClient, trainerId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("notification_dismissals")
    .select("key, dismissed_until")
    .eq("trainer_id", trainerId);
  if (error || !data) return new Set();
  const now = Date.now();
  return new Set(
    data
      .filter((r) => r.dismissed_until == null || new Date(r.dismissed_until as string).getTime() > now)
      .map((r) => r.key as string),
  );
}
