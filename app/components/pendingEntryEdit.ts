/*
 * „Pridať cvik a vyplniť v jednom kroku“ (builder trénera): knižnica / vlastný cvik po
 * pridaní požiada o otvorenie úpravy nového cviku. Riadok cviku ešte nemusí existovať
 * (server ho dodá až revalidáciou), preto sa ID odloží a riadok si ho vyzdvihne pri
 * vzniku (takePendingEdit); ak už existuje, dostane udalosť. Po uložení takého cviku sa
 * fokus vráti na pridávanie ďalšieho (len s myšou — na dotyku by vyskočila klávesnica).
 */
const EDIT_EVENT = "fitpilot:edit-entry";
const FOCUS_ADD_EVENT = "fitpilot:focus-add-exercise";

let pending: string | null = null;

export function requestEntryEdit(entryId: string): void {
  pending = entryId;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EDIT_EVENT, { detail: entryId }));
}

/** true = tento cvik bol práve pridaný a má sa otvoriť na úpravu — bez vedľajšieho efektu
 *  (bezpečné v inicializátore stavu, ktorý React v dev režime volá dvakrát). */
export function isPendingEdit(entryId: string): boolean {
  return pending === entryId;
}

/** Vyzdvihne požiadavku (jednorazovo) — v efekte / obsluhe udalosti. */
export function takePendingEdit(entryId: string): boolean {
  if (pending !== entryId) return false;
  pending = null;
  return true;
}

export function onEntryEditRequest(cb: (entryId: string) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<string>).detail);
  window.addEventListener(EDIT_EVENT, handler);
  return () => window.removeEventListener(EDIT_EVENT, handler);
}

export function focusAddExercise(): void {
  if (typeof window === "undefined") return;
  if (!window.matchMedia("(pointer: fine)").matches) return;
  window.dispatchEvent(new Event(FOCUS_ADD_EVENT));
}

export function onFocusAddExercise(cb: () => void): () => void {
  window.addEventListener(FOCUS_ADD_EVENT, cb);
  return () => window.removeEventListener(FOCUS_ADD_EVENT, cb);
}
