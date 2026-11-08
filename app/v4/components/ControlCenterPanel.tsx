import styles from "../page.module.css";

// "All In One" no longer repeats the marquee/stack-fan cards — instead ONE
// composite widget, macOS Control Center idiom: several real metrics
// living inside a single frame instead of scattered across identical
// boxes. This is the one place on the page all three data types (progress
// ring, macro split, weekly adherence) appear together, which is the
// actual point of the section's headline.
export function ControlCenterPanel() {
  const r = 30;
  const c = 2 * Math.PI * r;
  const value = 0.72;
  const macro = [
    { label: "Bielkoviny", pct: 50 },
    { label: "Sacharidy", pct: 69 },
    { label: "Tuky", pct: 17 },
  ];
  const week = ["moss", "moss", "coral", "moss", "steel", "moss", "moss"] as const;

  return (
    <div className={styles.controlCenter}>
      <div className={styles.controlCenterTile}>
        <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true">
          <circle cx="38" cy="38" r={r} fill="none" stroke="var(--steel-line)" strokeWidth="7" />
          <circle
            cx="38"
            cy="38"
            r={r}
            fill="none"
            stroke="var(--iron-red)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - value)}
            transform="rotate(-90 38 38)"
          />
        </svg>
        <span className={styles.controlCenterValue}>12 tréningov</span>
        <span className={styles.dataCardLabel}>odcvičené spolu</span>
      </div>

      <div className={styles.controlCenterDivider} aria-hidden="true" />

      <div className={styles.controlCenterTile}>
        <span className={styles.controlCenterValue}>1133 / 2350 kcal</span>
        <div className={styles.macroBars}>
          {macro.map((m) => (
            <div key={m.label} className={styles.macroBarRow}>
              <span className={styles.macroBarLabel}>{m.label}</span>
              <span className={styles.macroBarTrack}>
                <span className={styles.macroBarFill} style={{ width: `${m.pct}%` }} />
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.controlCenterDivider} aria-hidden="true" />

      <div className={styles.controlCenterTile}>
        <span className={styles.controlCenterValue}>93 % cieľa</span>
        <div className={styles.adherenceStrip}>
          {week.map((d, i) => (
            <span key={i} className={`${styles.adherenceDot} ${styles[`adherence_${d}`]}`} />
          ))}
        </div>
        <span className={styles.dataCardLabel}>adherencia stravy · 7 dní</span>
      </div>
    </div>
  );
}
