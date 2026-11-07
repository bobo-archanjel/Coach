// Knižnica cvikov pre buildery (feature/faster-app) — zdieľaná cache globálnych cvikov.
//
// Globálna knižnica (`trainer_id is null`, ~886 riadkov z Free Exercise DB) vzniká len
// jednorazovým importom (scripts/import-exercises.mjs) a v appke sa nemení, takže je
// bezpečné ju cachovať naprieč všetkými požiadavkami (`unstable_cache`, 1 h). Predtým
// ju portál cachoval, ale trénerov builder ju ťahal priamo z DB pri KAŽDOM renderi aj
// po každej úprave plánu (revalidatePath) — ~300 kB a 200-650 ms navyše na klik.
// Teraz obe strany čítajú ten istý cache záznam; tréner k nemu dostane len malý
// dopyt na vlastné cviky.
//
// Service-role klient, lebo `unstable_cache` zakazuje cookies()/dynamické API vo
// vnútri (a anon rola od 0036 nemá na tabuľky práva). Filter `trainer_id is null`
// drží, že sa cez cache nedostane nič iné než verejná globálna knižnica.

import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";
import type { ExerciseLibraryRow } from "@/lib/exercises";

const LIBRARY_COLUMNS = "id, name, name_sk, muscle_group, image_url";

/** Buildery zobrazujú len prvý obrázok (náhľad) — zvyšok len zbytočne nafukoval payload. */
function toRow(e: {
  id: string;
  name: string;
  name_sk: string | null;
  muscle_group: string | null;
  image_url: string[] | null;
}): ExerciseLibraryRow {
  return {
    id: e.id,
    name: e.name,
    name_sk: e.name_sk ?? null,
    muscle_group: e.muscle_group ?? null,
    image_url: Array.isArray(e.image_url) && e.image_url.length > 0 ? [e.image_url[0]] : [],
  };
}

/**
 * Globálna knižnica, zoradená podľa názvu. Chyba sa VYHODÍ, nie vráti ako [] —
 * `unstable_cache` výnimku neuloží, takže prechodný výpadok neurobí z knižnice
 * hodinu prázdny zoznam.
 */
export const getGlobalExerciseRows = unstable_cache(
  async (): Promise<ExerciseLibraryRow[]> => {
    const { data, error } = await createAdminClient()
      .from("exercises")
      .select(LIBRARY_COLUMNS)
      .is("trainer_id", null)
      .order("name", { ascending: true });
    if (error) throw new Error(`exercise library: ${error.message}`);
    return (data ?? []).map(toRow);
  },
  ["global-exercise-library-v1"],
  { revalidate: 3600 },
);

/**
 * Knižnica pre trénerov builder: cachovaná globálna + vlastné cviky trénera (RLS
 * `exercises_select_global_or_own` pustí len jeho). Pri výpadku cache padá späť na
 * pôvodný priamy dopyt, nech builder nikdy neostane bez knižnice.
 */
export async function getTrainerExerciseLibrary(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<ExerciseLibraryRow[]> {
  const [global, { data: own }] = await Promise.all([
    getGlobalExerciseRows().catch((err: unknown) => {
      console.error("getTrainerExerciseLibrary:", err instanceof Error ? err.message : err);
      return null;
    }),
    supabase.from("exercises").select(LIBRARY_COLUMNS).not("trainer_id", "is", null).order("name"),
  ]);
  if (!global) {
    const { data } = await supabase.from("exercises").select(LIBRARY_COLUMNS).order("name");
    return (data ?? []).map(toRow);
  }
  if (!own || own.length === 0) return global;
  return [...global, ...own.map(toRow)].sort((a, b) => a.name.localeCompare(b.name, "en"));
}
