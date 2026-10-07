"use client";

// FitPilot — feature/navod: psychológia spinnerov. (1) Pod ~500ms sa nezobrazí
// nič — krátka akcia, ktorá stihne doletieť skôr, než si to človek vôbec
// všimne, nepotrebuje loading chrome (blikajúci spinner na 200ms pôsobí horšie
// než žiadny). (2) Pri dlhšom čakaní sa text mení namiesto statického "Načítavam…"
// — každá ďalšia správa ubezpečuje, že appka stále pracuje, nie je zaseknutá.

import { useEffect, useRef, useState } from "react";

const SHOW_DELAY_MS = 500;
const ROTATE_MS = 1800;

/**
 * `active` = akcia beží. Vráti `null` prvých ~500ms (nezobrazovať nič), potom
 * postupne rotuje cez `messages` a zostane na poslednej správe, kým akcia trvá.
 */
export function useLoadingMessage(active: boolean, messages: string[]): string | null {
  const [visibleIndex, setVisibleIndex] = useState<number | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    if (!active) {
      setVisibleIndex(null);
      return;
    }
    const showTimer = setTimeout(() => setVisibleIndex(0), SHOW_DELAY_MS);
    let rotateTimer: ReturnType<typeof setInterval> | null = null;
    const startRotation = () => {
      rotateTimer = setInterval(() => {
        setVisibleIndex((i) => {
          if (i === null) return 0;
          return Math.min(i + 1, messagesRef.current.length - 1);
        });
      }, ROTATE_MS);
    };
    const rotationDelay = setTimeout(startRotation, SHOW_DELAY_MS);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(rotationDelay);
      if (rotateTimer) clearInterval(rotateTimer);
    };
  }, [active]);

  if (visibleIndex === null) return null;
  return messages[visibleIndex] ?? messages[messages.length - 1] ?? null;
}
