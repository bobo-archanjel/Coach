/**
 * Zdieľaný "je tréning práve rozcvičený?" príznak medzi LogWorkoutButton (nastaví ho
 * pri "Začať tréning") a WorkoutStopwatch (podľa neho zobrazí plávajúcu ikonu stopiek).
 *
 * Perzistuje v localStorage, takže po prepnutí tabu v portáli (Tréning, Chat…) a
 * návrate na "Dnes" stopky aj stav tréningu pokračujú. Príznak je viazaný na
 * konkrétny workout_day a má TTL — starý príznak z rotačne sa opakujúceho dňa
 * nerozbalí formulár omylom o týždeň neskôr.
 */

export const WORKOUT_STARTED_EVENT = "fitpilot:workout-started";

const STARTED_KEY = "fitpilot.workout.started.v1";
const TTL_MS = 6 * 60 * 60 * 1000; // 6 h — dosť na jeden tréning, nie na ďalší cyklus

type StartedRecord = { dayId: string; at: number };

export function markWorkoutStarted(dayId: string): void {
  try {
    const rec: StartedRecord = { dayId, at: Date.now() };
    localStorage.setItem(STARTED_KEY, JSON.stringify(rec));
  } catch {
    /* private mode / disabled storage — feature degraduje na "žije len tento mount" */
  }
  try {
    window.dispatchEvent(new CustomEvent(WORKOUT_STARTED_EVENT, { detail: { dayId } }));
  } catch {
    /* CustomEvent nedostupný — ignoruj */
  }
}

export function isWorkoutStarted(dayId: string): boolean {
  try {
    const raw = localStorage.getItem(STARTED_KEY);
    if (!raw) return false;
    const rec = JSON.parse(raw) as Partial<StartedRecord>;
    return (
      rec?.dayId === dayId &&
      typeof rec.at === "number" &&
      Date.now() - rec.at < TTL_MS
    );
  } catch {
    return false;
  }
}

export function clearWorkoutStarted(): void {
  try {
    localStorage.removeItem(STARTED_KEY);
  } catch {
    /* ignoruj */
  }
}
