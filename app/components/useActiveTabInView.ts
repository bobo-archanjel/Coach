"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Dráha dní v builderi sa na mobile posúva do strany — po zmene vybraného dňa (klik,
 * nový alebo skopírovaný deň) ho posunie do záberu. Len vodorovne v rámci dráhy
 * (scrollTo na kontajneri, nie scrollIntoView), aby stránka neskákala hore-dole.
 * Prvé vykreslenie sa preskočí.
 */
export function useActiveTabInView(trackRef: RefObject<HTMLElement | null>, activeKey: string | null) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const track = trackRef.current;
    const tab = track?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!track || !tab || track.scrollWidth <= track.clientWidth) return;
    const left = tab.offsetLeft;
    const right = left + tab.offsetWidth;
    if (left < track.scrollLeft || right > track.scrollLeft + track.clientWidth) {
      track.scrollTo({ left: Math.max(0, left - 12), behavior: "smooth" });
    }
  }, [trackRef, activeKey]);
}
