"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, useReducedMotion, type MotionValue } from "motion/react";
import styles from "../page.module.css";

// Apple-style scroll-scrubbed image sequence (AirPods/MacBook product pages):
// the sticky frame doesn't just sit still — it crossfades between the three
// real screenshots exactly in sync with which step is in view, driven
// directly by scroll position (`useScroll` + `useTransform`), not a
// scroll-triggered one-shot animation. A `useTransform` call must live in
// its own component (rules-of-hooks) — hence `ShotFrame` per image instead
// of calling the hook inside `.map()`.
//
// The DOM tree is IDENTICAL regardless of `reduced` — only each frame's
// opacity range differs (frame 0 pinned visible, the rest pinned hidden).
// An earlier version branched the whole tree on `useReducedMotion()` (which
// is `null` during SSR and resolves client-side after mount) and threw a
// real hydration mismatch, caught during verification.
type Step = { title: string; copy: string; shot: string };

function ShotFrame({
  src,
  progress,
  range,
  reduced,
  isFirst,
}: {
  src: string;
  progress: MotionValue<number>;
  range: [number, number, number, number];
  reduced: boolean;
  isFirst: boolean;
}) {
  const solid = isFirst ? 1 : 0;
  const output: number[] = reduced ? [solid, solid, solid, solid] : [0, 1, 1, 0];
  const opacity = useTransform(progress, range, output);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <motion.img src={src} alt="" style={{ opacity }} className={styles.solutionShotFrame} suppressHydrationWarning />
  );
}

export function SolutionScrolly({ steps }: { steps: Step[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = Boolean(useReducedMotion());
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const parallaxY = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [0, -36]);
  const n = steps.length;
  const margin = 0.06;

  return (
    <div ref={ref} className={styles.solutionGrid}>
      <div className={styles.solutionSticky}>
        <motion.div className={styles.solutionShotStack} style={{ y: parallaxY }}>
          {steps.map((s, i) => {
            const start = i / n;
            const end = (i + 1) / n;
            const range: [number, number, number, number] =
              i === 0
                ? [0, 0, end - margin, end]
                : i === n - 1
                  ? [start, start + margin, 1, 1]
                  : [start, start + margin, end - margin, end];
            return <ShotFrame key={s.shot + i} src={s.shot} progress={scrollYProgress} range={range} reduced={reduced} isFirst={i === 0} />;
          })}
        </motion.div>
      </div>
      <div className={styles.solutionSteps}>
        {steps.map((step, i) => (
          <motion.div
            key={step.title}
            className={styles.solutionStep}
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className={styles.solutionStepNum}>{String(i + 1).padStart(2, "0")}</span>
            <h3 className={styles.solutionStepTitle}>{step.title}</h3>
            <p className={styles.solutionStepCopy}>{step.copy}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
