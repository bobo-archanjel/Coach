"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { sceneState } from "../lib/sceneState";
import styles from "../page.module.css";

const RADIUS = 54;
const CIRC = 2 * Math.PI * RADIUS;

/**
 * ~1.5s intro pred odhalením stránky (vyžiadané) — logo + prstenec sa
 * vykreslí, potom sa celá clona odsunie nahor a odomkne scroll. Zamyká
 * `document.body` scroll počas behu, nech používateľ neuvidí nedokreslenú
 * scénu pod preloaderom. `sceneState.ready` uvoľní Athlete/ParticleField
 * spustenie ich vlastných entrance animácií presne v momente, keď je
 * clona preč — inak by bežali skryté a "premrhali" prvú sekundu.
 */
export function Preloader() {
  const ref = useRef<HTMLDivElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      sceneState.ready = true;
      setDone(true);
      return;
    }

    document.body.style.overflow = "hidden";
    const tl = gsap.timeline({
      onComplete: () => {
        document.body.style.overflow = "";
        sceneState.ready = true;
        setDone(true);
      },
    });

    tl.set(ringRef.current, { strokeDashoffset: CIRC })
      .to(ringRef.current, { strokeDashoffset: 0, duration: 1.0, ease: "power2.inOut" })
      .to(`.${styles.preloaderNum}`, { opacity: 1, duration: 0.2 }, "<")
      .to(`.${styles.preloaderBoot}`, { opacity: 1, duration: 0.2 }, "<0.1")
      .to(ref.current, { yPercent: -100, duration: 0.6, ease: "power3.inOut" }, "+=0.15");

    return () => {
      tl.kill();
      document.body.style.overflow = "";
    };
  }, []);

  if (done) return null;

  return (
    <div ref={ref} className={styles.preloader} aria-hidden="true">
      <svg viewBox="0 0 120 120" className={styles.preloaderRing}>
        <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="rgba(224,64,42,0.18)" strokeWidth="4" />
        <circle
          ref={ringRef}
          cx="60"
          cy="60"
          r={RADIUS}
          fill="none"
          stroke="var(--iron-red)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <span className={styles.preloaderNum}>FitPilot</span>
      <span className={styles.preloaderBoot}>SYSTEM READY_</span>
    </div>
  );
}
