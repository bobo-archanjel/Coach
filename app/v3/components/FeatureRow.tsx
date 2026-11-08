"use client";

import { motion } from "motion/react";
import styles from "../page.module.css";

// Classic zig-zag feature row — no pin, no scrub. Each row is its own
// independent whileInView reveal: text slides up, the screenshot fades in
// with a slight 3D tilt that settles flat as the row centers in view. The
// tag label gets a short stagger delay behind the image (0.08s), per the
// brief's "labelky majú kratší stagger delay za obrázkom" rule.
export function FeatureRow({
  index,
  title,
  copy,
  shot,
  reverse,
}: {
  index: number;
  title: string;
  copy: string;
  shot: string;
  reverse?: boolean;
}) {
  const ease = [0.16, 1, 0.3, 1] as const;

  return (
    <div className={`${styles.featureRow} ${reverse ? styles.featureRowReverse : ""}`}>
      <motion.div
        className={styles.featureText}
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.7, ease }}
      >
        <motion.span
          className={styles.featureTag}
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5, ease, delay: 0.08 }}
        >
          {String(index).padStart(2, "0")}
        </motion.span>
        <h3 className={styles.featureTitle}>{title}</h3>
        <p className={styles.featureCopy}>{copy}</p>
      </motion.div>

      <div className={styles.featureShotWrap} style={{ perspective: 1200 }}>
        <motion.div
          initial={{ opacity: 0, y: 24, rotateX: reverse ? -6 : 6 }}
          whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
          viewport={{ once: true, margin: "-100px", amount: 0.4 }}
          transition={{ duration: 0.8, ease }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot} alt="" className={styles.featureShot} />
        </motion.div>
      </div>
    </div>
  );
}
