import type { ReactNode } from "react";
import styles from "./portal.module.css";

/* Zdieľaná coming-soon obrazovka pre taby, ktoré stavajú ďalšie fázy (B/C/D). */
export function ComingSoon({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className={styles.soon}>
      <span className={styles.soonTile} aria-hidden="true">
        {icon}
      </span>
      <h1>{title}</h1>
      <p>{children}</p>
      <span className={styles.soonChip}>Pripravujeme</span>
    </div>
  );
}
