"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView, animate } from "motion/react";
import styles from "../page.module.css";

/**
 * Veľký prstenec + počítajúce sa číslo — jadro "wearable recap" smeru
 * (feature/security#2, direction: IMPECCABLE'S PICK, seed 7071a2de).
 * Rovnaká geometria ako prstenec postupu v /portal (DESIGN.md), len väčšia
 * — viewBox 220, polomer 92, stroke 16, štart -90°. Číslo sa počíta pri
 * vstupe do viewportu (useInView, spustí sa raz).
 */
export function RingStat({
  value,
  suffix = "",
  label,
  sublabel,
  size = 220,
}: {
  value: number;
  suffix?: string;
  label: string;
  sublabel?: string;
  size?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10%" });
  const [display, setDisplay] = useState(0);
  const radius = 92;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration: 1.4,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, value]);

  // Text sa predtým neškáloval s `size` — 160px varianta (final CTA) mala
  // rovnako veľký text ako 220px hero prstenec a číslo/label/sublabel
  // pretekali von cez obrys. `scale` drží text úmerný priemeru prstenca;
  // sublabel sa pri malej variante radšej vynechá, nie zmenší na nečitateľné.
  const scale = size / 220;
  const showSublabel = Boolean(sublabel) && size >= 200;

  return (
    <div ref={ref} className={styles.ringWrap} style={{ width: size, height: size }}>
      <svg viewBox="0 0 220 220" className={styles.ringSvg}>
        <circle cx="110" cy="110" r={radius} fill="none" stroke="rgba(224,64,42,0.16)" strokeWidth="16" />
        <motion.circle
          cx="110"
          cy="110"
          r={radius}
          fill="none"
          stroke="var(--iron-red)"
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={circumference}
          transform="rotate(-90 110 110)"
          initial={{ strokeDashoffset: circumference }}
          animate={inView ? { strokeDashoffset: 0 } : {}}
          transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className={styles.ringCenter} style={{ "--ring-scale": scale } as React.CSSProperties}>
        <span className={styles.ringNum}>
          {display}
          {suffix}
        </span>
        <span className={styles.ringLabel}>{label}</span>
        {showSublabel && <span className={styles.ringSublabel}>{sublabel}</span>}
      </div>
    </div>
  );
}
