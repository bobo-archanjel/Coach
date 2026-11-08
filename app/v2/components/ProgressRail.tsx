"use client";

import { useEffect, useRef } from "react";
import { sceneState } from "../lib/sceneState";
import styles from "../page.module.css";

// "Poriadny element cez celú stránku" (vyžiadané) — fixná vertikálna
// progress-koľajnica po celej výške viewportu, viditeľná v každej sekcii,
// nie len v hero. Výplň lineárne sleduje `sceneState.progress` (0..1 cez
// celú stránku), tiky sa rozsvecujú podľa `sceneState.section` — obe už
// nastavuje existujúci GSAP ScrollTrigger vo V2Experience, tento komponent
// ich len vizualizuje cez rAF polling (rovnaký vzor ako Athlete/ParticleField
// predtým — čítanie 60×/s, žiadny React state/re-render). Mierny
// mouse-parallax navyše (vypnutý pri reduced-motion); samotná výplň/tiky
// ostávajú aktívne aj tam — sú priamo úmerné vlastnému scrollu používateľa,
// nie autoplay efekt, ktorému by reduced-motion mal brániť.
const SECTION_LABELS = ["ŠTART", "SYSTÉM", "PROTOKOL", "AI CORE", "CENNÍK", "FINÁLE"];

export function ProgressRail() {
  const railRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const tickRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = window.matchMedia("(max-width: 900px)").matches;
    if (mobile) return;

    let rafId: number;
    const loop = () => {
      if (fillRef.current) {
        fillRef.current.style.transform = `scaleY(${sceneState.progress})`;
      }
      tickRefs.current.forEach((el, i) => {
        el?.classList.toggle(styles.railTickActive, sceneState.section >= i);
      });
      if (railRef.current && !reduced) {
        railRef.current.style.transform = `translateY(-50%) translateX(${sceneState.mouse.x * 4}px)`;
      }
      rafId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div ref={railRef} className={styles.progressRail} aria-hidden="true">
      <div className={styles.railTrack}>
        <div ref={fillRef} className={styles.railFill} />
      </div>
      <div className={styles.railTicks}>
        {SECTION_LABELS.map((label, i) => (
          <div
            key={label}
            ref={(el) => {
              tickRefs.current[i] = el;
            }}
            className={styles.railTick}
            style={{ top: `${(i / (SECTION_LABELS.length - 1)) * 100}%` }}
          >
            <span className={styles.railDot} />
            <span className={styles.railLabel}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
