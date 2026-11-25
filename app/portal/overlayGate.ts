"use client";

import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";

/* Poradie osláv po ukončení tréningu: súhrn „Tréning v číslach“ → oslava úspechov (UnlockModal) → toast prstencov.
   Každý prekryv sa počas zobrazenia zapíše pod svoj kľúč; ďalší v poradí čaká, kým sú všetky skoršie zatvorené. */

export type OverlayKey = "finish" | "unlock" | "rings";
const ORDER: OverlayKey[] = ["finish", "unlock", "rings"];
const active = new Set<OverlayKey>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Zapíše prekryv ako aktívny, kým je `on` pravda. */
export function useOverlayActive(key: OverlayKey, on: boolean) {
  const useIsoLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;
  useIsoLayout(() => {
    if (!on) return;
    active.add(key);
    emit();
    return () => {
      active.delete(key);
      emit();
    };
  }, [key, on]);
}

/** Je zobrazený niektorý skorší prekryv v poradí? Vtedy treba počkať. */
export function useOverlayBlocked(key: OverlayKey): boolean {
  const before = ORDER.slice(0, ORDER.indexOf(key));
  return useSyncExternalStore(
    subscribe,
    () => before.some((k) => active.has(k)),
    () => false,
  );
}
