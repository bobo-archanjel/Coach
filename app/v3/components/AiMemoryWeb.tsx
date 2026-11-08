"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import styles from "../page.module.css";

// AI as a "memory web": a central node with the trainer's data points
// gathered around it, wired in one by one as the visitor scrolls — the
// visual metaphor for "the AI coach remembers context across everything",
// not a generic neural-network decoration. Every point + line shares one
// scroll-linked progress value; nothing here is a mount-once animation.
const POINTS = [
  { label: "Váha", angle: -100 },
  { label: "Tréning", angle: -55 },
  { label: "Jedálniček", angle: -15 },
  { label: "Nálada", angle: 25 },
  { label: "Spánok", angle: 65 },
  { label: "Adherencia", angle: 105 },
  { label: "Merania", angle: 155 },
  { label: "Ciele", angle: -155 },
];

const CX = 220;
const CY = 220;
const R = 168;

function point(angle: number) {
  const rad = (angle * Math.PI) / 180;
  return { x: CX + Math.cos(rad) * R, y: CY + Math.sin(rad) * R };
}

// One line + one dot per data point. Each gets its own scroll slice so the
// web visibly "builds" in sequence rather than all points snapping in at
// once. `useTransform` must live in its own component per rules-of-hooks.
function AiPoint({
  label,
  angle,
  progress,
  range,
  reduced,
}: {
  label: string;
  angle: number;
  progress: MotionValue<number>;
  range: [number, number];
  reduced: boolean;
}) {
  const { x, y } = point(angle);
  const pathLength = useTransform(progress, range, reduced ? [1, 1] : [0, 1]);
  const dotOpacity = useTransform(progress, range, reduced ? [1, 1] : [0, 1]);

  return (
    <g>
      <motion.line
        x1={CX}
        y1={CY}
        x2={x}
        y2={y}
        className={styles.aiLine}
        style={{ pathLength }}
        suppressHydrationWarning
      />
      <motion.circle cx={x} cy={y} r={5.5} className={styles.aiDot} style={{ opacity: dotOpacity }} suppressHydrationWarning />
      <motion.text x={x} y={y + (angle > -90 && angle < 90 ? 20 : -14)} textAnchor="middle" className={styles.aiLabel} style={{ opacity: dotOpacity }} suppressHydrationWarning>
        {label}
      </motion.text>
    </g>
  );
}

export function AiMemoryWeb() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = Boolean(useReducedMotion());
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.75", "start 0.1"] });
  const n = POINTS.length;

  return (
    <div ref={ref} className={styles.aiWebWrap}>
      <div className={styles.aiCore} aria-hidden="true">
        <span className={styles.aiCoreLabel}>AI</span>
      </div>
      <svg viewBox={`0 0 ${CX * 2} ${CY * 2}`} className={styles.aiSvg} aria-hidden="true">
        {POINTS.map((p, i) => {
          // stagger each point's own build-in slice across the section's
          // scroll range, with slight overlap so it reads as continuous
          const start = (i / n) * 0.85;
          const end = start + 0.3;
          return <AiPoint key={p.label} label={p.label} angle={p.angle} progress={scrollYProgress} range={[start, end]} reduced={reduced} />;
        })}
      </svg>
    </div>
  );
}
