"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion, useTransform, animate, type MotionValue } from "motion/react";
import styles from "../page.module.css";

// The hero's fastest parallax layer — small stat chips pulled straight out
// of the app's own UI (the training-plan progress ring, the workout-count
// counter), drifting up and away faster than the phone as the visitor
// scrolls, as if they were flying off the screen toward the viewer. Mobile
// keeps them as plain static chips (no parallax speed difference — still
// readable, just not part of the depth effect).
function CountUpNumber({ to, start }: { to: number; start: boolean }) {
  const [n, setN] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!start) return;
    if (reduced) {
      setN(to);
      return;
    }
    const controls = animate(0, to, {
      duration: 1.3,
      ease: [0.25, 0.1, 0.25, 1],
      onUpdate: (v) => setN(Math.round(v)),
    });
    return () => controls.stop();
  }, [start, to, reduced]);

  return <>{n}</>;
}

export function StatChips({ progress, start }: { progress: MotionValue<number>; start: boolean }) {
  const reduced = Boolean(useReducedMotion());
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    setDesktop(window.matchMedia("(min-width: 768px)").matches);
  }, []);

  // fastest layer, but restrained: research on Apple's own parallax pages
  // says layers should shift "a few dozen pixels over a full viewport of
  // scrolling" — once a visitor consciously notices the mechanic it needs
  // easing back, not amplifying. This is visibly faster than the glow's
  // ~100px and the phone's own scroll-turn, without dominating the layout.
  const fastY = useTransform(progress, [0, 1], [0, desktop && !reduced ? -55 : 0]);

  return (
    <>
      <motion.div
        className={`${styles.statChip} ${styles.statChipA}`}
        style={{ y: fastY }}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, delay: 0.9, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <span className={styles.statChipNum}>
          <CountUpNumber to={12} start={start} />
        </span>
        <span className={styles.statChipLabel}>tréningov</span>
      </motion.div>

      <motion.div
        className={`${styles.statChip} ${styles.statChipB}`}
        style={{ y: fastY }}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, delay: 1.05, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <span className={styles.statChipRing} aria-hidden="true" />
        <span className={styles.statChipLabel}>0/6 cvikov</span>
      </motion.div>
    </>
  );
}
