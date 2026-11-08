"use client";

import { useEffect, useRef } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { sceneState } from "../lib/sceneState";

gsap.registerPlugin(ScrollTrigger);

/**
 * Lenis (plynulý momentum scroll) naviazaný na GSAP ScrollTrigger cez jeho
 * vlastný ticker — Lenis riadi skutočnú scroll pozíciu, ScrollTrigger.update()
 * sa volá na každý Lenis "scroll" event, aby oba systémy vždy videli tú istú
 * hodnotu (bežný odporúčaný vzor Lenis+GSAP, inak sa scrub animácie oneskoria
 * za skutočným scrollom). `lagSmoothing(0)` vypína GSAP vlastné dobiehanie
 * dlhých framov — s Lenis by dve nezávislé vyhladzovacie vrstvy kolidovali.
 */
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    sceneState.reducedMotion = reduced;
    sceneState.isMobile = window.matchMedia("(max-width: 860px)").matches;

    if (reduced) return; // natívny scroll, žiadne vrstvy navyše

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => 1 - Math.pow(1 - t, 3),
      smoothWheel: true,
    });
    lenisRef.current = lenis;

    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);

    return () => {
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  return <>{children}</>;
}
