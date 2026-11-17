import { timedSeconds } from "./timedReps";

/**
 * Hodnoty nového cviku v builderi („pridať a vyplniť v jednom kroku“): namiesto pevných
 * 3×10 / 90 s sa prevezmú z posledného cviku dňa — keď tréner zadal 4×8 s pauzou 120 s,
 * ďalší cvik príde s tým istým a často stačí „Uložiť“. Čas série (cvik na čas, „60 s“)
 * sa neprenáša — ďalší cvik je skôr na opakovania. Záťaž a poznámka sú vždy prázdne.
 */
export const ENTRY_DEFAULTS = { sets: 3, reps: "10", restSeconds: 90 } as const;

export function nextEntryDefaults(
  last: { sets?: number | string | null; reps?: string | null; restSeconds?: number | string | null } | null | undefined,
): { sets: number; reps: string; restSeconds: number } {
  if (!last) return { ...ENTRY_DEFAULTS };
  const sets = Number(last.sets);
  const rest = last.restSeconds === "" || last.restSeconds == null ? NaN : Number(last.restSeconds);
  const reps = typeof last.reps === "string" ? last.reps.trim() : "";
  return {
    sets: Number.isFinite(sets) && sets > 0 ? sets : ENTRY_DEFAULTS.sets,
    reps: reps && timedSeconds(reps) == null ? reps : ENTRY_DEFAULTS.reps,
    restSeconds: Number.isFinite(rest) && rest >= 0 ? rest : ENTRY_DEFAULTS.restSeconds,
  };
}
