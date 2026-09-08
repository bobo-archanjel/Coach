"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import styles from "../page.module.css";

// Full-height cinematic "visual interpunctuation" — the reference uses this
// twice (once before How It Works, once as the close) as a breath between
// denser sections. One dominant real-product image, a short 2-3 word
// headline, a rim-light glow in the one accent color appropriate to that
// moment (coral = progress/action, per DESIGN.md's one-accent rule — never
// a new hue). The image is a tight, dramatic crop (object-position), not a
// shrunken screenshot in a browser frame.
export function ChapterBreak({
  src,
  alt,
  objectPosition,
  headline,
  sub,
  glow = "coral",
  children,
}: {
  src: string;
  alt: string;
  objectPosition: string;
  headline: string;
  sub?: string;
  glow?: "coral" | "amber" | "moss";
  children?: ReactNode;
}) {
  const reduced = Boolean(useReducedMotion());

  return (
    <section className={`${styles.chapter} ${styles[`chapterGlow_${glow}`]}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={styles.chapterImg} style={{ objectPosition }} />
      <div className={styles.chapterScrim} aria-hidden="true" />
      <div className={styles.chapterRim} aria-hidden="true" />
      <div className={styles.chapterContent}>
        <motion.h2
          className={styles.chapterHeadline}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: reduced ? 0 : 0.7, ease: [0.25, 0.1, 0.25, 1] }}
        >
          {headline}
        </motion.h2>
        {sub && (
          <motion.p
            className={styles.chapterSub}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: reduced ? 0 : 0.6, delay: reduced ? 0 : 0.15, ease: [0.25, 0.1, 0.25, 1] }}
          >
            {sub}
          </motion.p>
        )}
        {children}
      </div>
    </section>
  );
}
