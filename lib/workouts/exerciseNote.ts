/**
 * Poznámka k cviku v pláne (builder trénera aj vlastný tréning klienta), napr. „pomaly
 * dole, 3-0-1“ alebo „úzky úchop“. Ukladá sa do `workout_days.exercises[].tempo` —
 * pôvodne pole „Tempo“, premenované bez migrácie (staré hodnoty „3-0-1“ ostávajú platné).
 */
export const EXERCISE_NOTE_MAX = 200;
