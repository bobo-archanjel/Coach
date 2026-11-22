/**
 * Živý postup práve cvičeného tréningu (odškrtnuté cviky / všetky cviky vrátane pridaných)
 * medzi formulárom sérií (LogWorkoutButton) a krúžkom v hlavičke karty Dnes
 * (LiveProgressRing). Malý store pre useSyncExternalStore — oba sú na tej istej stránke,
 * netreba kontext ani localStorage (po refreshi formulár obnoví koncept a postup pošle znova).
 */

export interface WorkoutProgress {
  dayId: string;
  done: number;
  total: number;
}

let current: WorkoutProgress | null = null;
const listeners = new Set<() => void>();

export function publishWorkoutProgress(next: WorkoutProgress | null): void {
  if (
    current === next ||
    (current && next && current.dayId === next.dayId && current.done === next.done && current.total === next.total)
  ) {
    return;
  }
  current = next;
  for (const l of listeners) l();
}

export function subscribeWorkoutProgress(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getWorkoutProgress(): WorkoutProgress | null {
  return current;
}
