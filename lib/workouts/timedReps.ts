/**
 * Cvik na čas (statické holdy, plank…): builder ho ukladá do `reps` ako „60 s“ —
 * bez migrácie, rovnaký textový stĺpec ako „8-10“. Klient pri tréningu zapisuje
 * sekundy (workout_logs.entries → durationS), tréner ich porovná s plánom.
 */

/** „60 s“ / „60s“ / „60 sek“ → 60; opakovania („10“, „8-12“, „max“) → null. */
export function timedSeconds(reps: string | null | undefined): number | null {
  const m = reps?.trim().match(/^(\d{1,4})\s*(?:s|sek|sec)\.?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 ? n : null;
}

/** Sekundy → hodnota `reps` v pláne. */
export function timedReps(seconds: number): string {
  return `${seconds} s`;
}

export const TIMED_MAX_S = 3600;
