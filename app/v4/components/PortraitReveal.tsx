"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "motion/react";
import styles from "../page.module.css";

// Vertical reveal tied directly to scroll position — not autoplay. A
// clip-path inset closes over the image and opens as the section scrolls
// through, so scrubbing back up un-reveals it exactly as far as it came.
export function PortraitReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = Boolean(useReducedMotion());
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.9", "start 0.15"] });

  // Collapsing the useTransform range when reduced keeps the STRUCTURE
  // identical between server/client either way, but the resolved value at
  // scrollYProgress=0 still differs (85 vs 0) because `useReducedMotion()`
  // is `null` during SSR and can resolve synchronously on the client's very
  // first render (confirmed via a real hydration warning here) — that one
  // remaining value-only diff is the documented, expected case
  // `suppressHydrationWarning` exists for, not a structural bug.
  const inset = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [85, 0]);
  const clipPath = useTransform(inset, (v) => `inset(${v}% 0 0 0)`);

  return (
    <div ref={ref} className={styles.portraitWrap}>
      <motion.div className={styles.portraitFrame} style={{ clipPath }} suppressHydrationWarning>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/v2/screens/dennik.png" alt="Denník príjmu a jedálniček v appke FitPilot" className={styles.portraitImg} />
      </motion.div>
      <div className={styles.portraitCaption}>
        <p className={styles.portraitCaptionText}>
          V denníku klient zapisuje, čo skutočne zjedol — makrá sa dopočítajú samé, tréner vidí adherenciu bez toho, aby sa pýtal.
        </p>
      </div>
    </div>
  );
}
