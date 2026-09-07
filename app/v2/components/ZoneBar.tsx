"use client";

import { useRef } from "react";
import { motion, useInView } from "motion/react";
import styles from "../page.module.css";

/**
 * Jedna "zóna" v recap dashboarde — čerpá z HR-zone jazyka trackerov (Whoop/
 * Garmin), nie z bežnej feature karty. `tone` volí farbu presne podľa
 * DESIGN.md "pravidla jedného accentu" (coral = postup/CTA, amber = AI
 * kontext, moss = hotovo) — žiadna nová farba mimo systému.
 */
export function ZoneBar({
  index,
  title,
  copy,
  tone = "coral",
}: {
  index: number;
  title: string;
  copy: string;
  tone?: "coral" | "amber" | "moss";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15%" });

  return (
    <div ref={ref} className={styles.zoneRow}>
      <span className={styles.zoneIndex}>{String(index).padStart(2, "0")}</span>
      <div className={styles.zoneBody}>
        <div className={styles.zoneTrack}>
          <motion.div
            className={`${styles.zoneFill} ${styles[`zone${tone[0].toUpperCase()}${tone.slice(1)}`]}`}
            initial={{ scaleX: 0 }}
            animate={inView ? { scaleX: 1 } : {}}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: index * 0.08 }}
          />
        </div>
        <h3>{title}</h3>
        <p>{copy}</p>
      </div>
    </div>
  );
}
