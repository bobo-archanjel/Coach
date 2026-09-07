"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

/** Generický scroll-reveal, motion `whileInView` (nahrádza IntersectionObserver
    ručný kód z pôvodného landing page — tu je nová varianta, iná knižnica zámerne). */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
