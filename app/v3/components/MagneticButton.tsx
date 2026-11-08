"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useMotionValue, useSpring, useReducedMotion } from "motion/react";

// Wraps a button/link and pulls it a few px toward the cursor within a small
// radius — desktop pointer only; disabled entirely on touch and under
// prefers-reduced-motion (the child renders completely inert in either case,
// just a plain wrapper with no transform).
const RADIUS = 70;
const STRENGTH = 0.35;

export function MagneticButton({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [enabled, setEnabled] = useState(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  // critically damped (no overshoot/bounce) — Apple's own motion never
  // springs past its target, it decelerates precisely into place.
  const springX = useSpring(x, { stiffness: 260, damping: 24, mass: 0.4 });
  const springY = useSpring(y, { stiffness: 260, damping: 24, mass: 0.4 });

  useEffect(() => {
    const touch = window.matchMedia("(pointer: coarse)").matches;
    setEnabled(!touch && !reduced);
  }, [reduced]);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < RADIUS) {
        x.set(dx * STRENGTH);
        y.set(dy * STRENGTH);
      } else {
        x.set(0);
        y.set(0);
      }
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [enabled, x, y]);

  if (!enabled) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  return (
    <motion.div ref={ref} className={className} style={{ x: springX, y: springY, display: "inline-block" }}>
      {children}
    </motion.div>
  );
}
