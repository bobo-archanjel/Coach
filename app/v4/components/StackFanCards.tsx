"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import { StreakHeatmap, BigStatCard, ConversationExchange, WeeklyBarChart } from "./BentoCards";
import styles from "../page.module.css";

// Stack → fan interaction. Measured from the reference (8fps frame count),
// not estimated:
//   - stack holds static ~375ms (3 frames) before anything moves
//   - fan-out takes ~500-600ms, ease-out with NO overshoot
//     (cubic-bezier(0.16, 1, 0.3, 1) — this is the one place in this file
//     that intentionally uses a different curve than the page's default
//     0.25/0.1/0.25/1: that default is a general-purpose ease-in-out, this
//     card motion specifically needs a decelerate-only curve so the fan
//     settles rather than gliding past its final rotation)
//   - stagger ~100-130ms between cards (~1 frame apart at 8fps)
//   - fanned state holds ~500ms before the next section's own reveal is
//     reachable — approximated here as generous scroll distance/margin
//     rather than a literal timer, since this is scroll-driven, not an
//     autoplaying video
const STACK_HOLD = 0.375;
const FAN_DURATION = 0.55;
const FAN_STAGGER = 0.12;
const FAN_EASE = [0.16, 1, 0.3, 1] as const;

// A different card family from the marquee's (Ring/Macro/Adherence/Chat) —
// same underlying honesty (real product data), distinct visual pattern per
// card so this section doesn't just repeat what the visitor already saw.
const CARDS = [
  { key: "heatmap", stackRotate: -8, fanRotate: -6, render: () => <StreakHeatmap tint="coral" /> },
  { key: "bigstat", stackRotate: -3, fanRotate: -2, render: () => <BigStatCard tint="moss" /> },
  { key: "exchange", stackRotate: 3, fanRotate: 2, render: () => <ConversationExchange tint="neutral" /> },
  { key: "barchart", stackRotate: 8, fanRotate: 6, render: () => <WeeklyBarChart tint="amber" /> },
];

function cardVariants(index: number, stackRotate: number, fanRotate: number, reduced: boolean): Variants {
  return {
    stacked: {
      x: index * -6,
      y: 0,
      rotate: stackRotate,
      scale: 1 - index * 0.02,
      zIndex: CARDS.length - index,
    },
    fanned: {
      x: 0,
      y: 0,
      rotate: fanRotate,
      scale: 1,
      zIndex: CARDS.length - index,
      transition: reduced ? { duration: 0 } : { duration: FAN_DURATION, delay: STACK_HOLD + index * FAN_STAGGER, ease: FAN_EASE },
    },
  };
}

export function StackFanCards() {
  const reduced = Boolean(useReducedMotion());

  return (
    <div className={styles.stackFanWrap}>
      <motion.div
        className={styles.stackFanTrack}
        initial="stacked"
        whileInView="fanned"
        viewport={{ once: true, margin: "-120px", amount: 0.5 }}
      >
        {CARDS.map((c, i) => (
          <motion.div key={c.key} className={styles.stackFanSlot} variants={cardVariants(i, c.stackRotate, c.fanRotate, reduced)}>
            {c.render()}
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
