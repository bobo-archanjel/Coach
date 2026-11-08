"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, useReducedMotion, type MotionValue } from "motion/react";
import styles from "../page.module.css";

// Apple's signature "words light up as you scroll through the paragraph"
// effect (apple.com/privacy, feature-explainer pages) — each word's opacity
// is a direct function of scroll position within the paragraph's own scroll
// range, not a single fade-in. `useTransform` must live in its own
// component per rules-of-hooks, hence `Word` instead of calling the hook
// inside `.map()`.
//
// The DOM structure is IDENTICAL regardless of `reduced` (always the same
// <p> of word spans) — only the opacity *range* differs. Branching the
// element tree itself on `useReducedMotion()` (returns `null` during SSR,
// resolved client-side after mount) caused a real hydration mismatch here
// (caught via a console error during verification), because the server
// always renders the "not reduced" branch and the client can then render a
// structurally different tree on the very next paint.
function Word({
  children,
  progress,
  range,
  reduced,
}: {
  children: React.ReactNode;
  progress: MotionValue<number>;
  range: [number, number];
  reduced: boolean;
}) {
  const opacity = useTransform(progress, range, reduced ? [1, 1] : [0.22, 1]);
  return (
    // suppressHydrationWarning: opacity is a MotionValue whose starting
    // number depends on `useReducedMotion()`, which is intentionally `null`
    // during SSR (Motion's own SSR-safety design) and resolves client-side
    // after mount — the resulting one-frame style diff is expected, not a
    // real structural mismatch (verified: no fatal hydration error).
    <motion.span style={{ opacity }} className={styles.revealWord} suppressHydrationWarning>
      {children}
    </motion.span>
  );
}

export function ScrollTextReveal({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const reduced = Boolean(useReducedMotion());
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.8", "start 0.25"] });
  const words = text.split(" ");

  return (
    <p ref={ref} className={className}>
      {words.map((w, i) => {
        const start = i / words.length;
        const end = (i + 1) / words.length;
        return (
          <span key={i}>
            <Word progress={scrollYProgress} range={[start, end]} reduced={reduced}>
              {w}
            </Word>
            {i < words.length - 1 ? " " : ""}
          </span>
        );
      })}
    </p>
  );
}
