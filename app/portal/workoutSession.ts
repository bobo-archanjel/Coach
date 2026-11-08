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
const SW_HIDDEN_KEY = "fitpilot.stopwatch.hidden.v1";
const TTL_MS = 6 * 60 * 60 * 1000; // 6 h — dosť na jeden tréning, nie na ďalší cyklus

type StartedRecord = { dayId: string; at: number };

export function markWorkoutStarted(dayId: string): void {
  try {
    const rec: StartedRecord = { dayId, at: Date.now() };
    localStorage.setItem(STARTED_KEY, JSON.stringify(rec));
    localStorage.removeItem(SW_HIDDEN_KEY);
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

// ---------- rozpísané hodnoty tréningu (QA K7) ----------
// Formulár sérií žil len v React state — prepnutie tabu v portáli, uspatie telefónu
// alebo refresh ho vyprázdnili, hoci príznak "tréning začatý" prežil. Keďže je
// ukončený tréning od 0048 zamknutý, prázdne ukončenie sa už nedalo opraviť.
// Koncept sa ukladá pri každej zmene a maže až po úspešnom "Ukončiť tréning".

const DRAFT_KEY = "fitpilot.workout.draft.v1";

export type WorkoutDraft = {
  /** entry_id cvikov dňa v poradí — ak tréner medzitým deň zmenil, starý koncept sa neobnoví
   *  (riadky sú viazané na index cviku a padli by k inému cviku). */
  signature: string;
  rows: Record<number, { reps: string; weight: string }[]>;
  notes: Record<number, string | undefined>;
  rpe: string;
  sessionNote: string;
};

type DraftRecord = WorkoutDraft & { dayId: string; at: number };

export function saveWorkoutDraft(dayId: string, draft: WorkoutDraft): void {
  try {
    const rec: DraftRecord = { ...draft, dayId, at: Date.now() };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(rec));
  } catch {
    /* private mode / plný storage — koncept žije len v tomto mounte */
  }
}

export function loadWorkoutDraft(dayId: string, signature: string): WorkoutDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw) as Partial<DraftRecord>;
    if (rec?.dayId !== dayId || typeof rec.at !== "number" || Date.now() - rec.at >= TTL_MS) return null;
    if (rec.signature !== signature) return null;
    if (!rec.rows || typeof rec.rows !== "object") return null;
    return {
      signature,
      rows: rec.rows,
      notes: rec.notes && typeof rec.notes === "object" ? rec.notes : {},
      rpe: typeof rec.rpe === "string" ? rec.rpe : "",
      sessionNote: typeof rec.sessionNote === "string" ? rec.sessionNote : "",
    };
  } catch {
    return null;
  }
}

export function clearWorkoutDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignoruj */
  }
}

// ---------- skryté stopky (QA K20) ----------
// "Skryť stopky" predtým volalo clearWorkoutStarted() — formulár sa po návrate
// zbalil na "Začať tréning", akoby tréning skončil. Skrytie je teraz samostatný
// príznak viazaný na deň; nový "Začať tréning" (markWorkoutStarted) ho zruší.

export function hideStopwatchFor(dayId: string): void {
  try {
    localStorage.setItem(SW_HIDDEN_KEY, dayId);
  } catch {
    /* ignoruj */
  }
}

export function isStopwatchHidden(dayId: string): boolean {
  try {
    return localStorage.getItem(SW_HIDDEN_KEY) === dayId;
  } catch {
    return false;
  }
}
