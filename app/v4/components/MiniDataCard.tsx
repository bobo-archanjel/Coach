import styles from "../page.module.css";

// Real product-data mini-visualizations — the same principle as DESIGN.md's
// `.feature-row` idiom (a mini-visualization built from real data shapes,
// never an icon+label pair standing in for content). This family is used
// ONLY in the card marquee — the stack-to-fan section has its own distinct
// family (BentoCards.tsx) and "All In One" has its own composite widget
// (ControlCenterPanel.tsx), so the same cards never repeat across sections.
// Tint variants stay inside the existing token set — no new hue, just
// color-mix() blending an existing accent into --ink-2/--ink-3 at low
// saturation, per DESIGN.md's "one accent role each" rule.
export type CardTint = "neutral" | "coral" | "amber" | "moss";

const tintClass: Record<CardTint, string> = {
  neutral: styles.tintNeutral,
  coral: styles.tintCoral,
  amber: styles.tintAmber,
  moss: styles.tintMoss,
};

export function RingCard({ tint = "coral" }: { tint?: CardTint }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const value = 0.72;
  return (
    <div className={`${styles.dataCard} ${tintClass[tint]}`}>
      <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--steel-line)" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="var(--iron-red)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value)}
          transform="rotate(-90 32 32)"
        />
      </svg>
      <span className={styles.dataCardValue}>12 tréningov</span>
      <span className={styles.dataCardLabel}>odcvičené spolu</span>
    </div>
  );
}

export function MacroCard({ tint = "amber" }: { tint?: CardTint }) {
  const rows = [
    { label: "Bielkoviny", pct: 50 },
    { label: "Sacharidy", pct: 69 },
    { label: "Tuky", pct: 17 },
  ];
  return (
    <div className={`${styles.dataCard} ${tintClass[tint]}`}>
      <span className={styles.dataCardValue}>1133 / 2350 kcal</span>
      <div className={styles.macroBars}>
        {rows.map((r) => (
          <div key={r.label} className={styles.macroBarRow}>
            <span className={styles.macroBarLabel}>{r.label}</span>
            <span className={styles.macroBarTrack}>
              <span className={styles.macroBarFill} style={{ width: `${r.pct}%` }} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdherenceCard({ tint = "moss" }: { tint?: CardTint }) {
  // moss = within 85-115% of goal (documented DESIGN.md rule), coral =
  // outside it, steel = no entry that day.
  const days = ["moss", "moss", "coral", "moss", "steel", "moss", "moss"] as const;
  return (
    <div className={`${styles.dataCard} ${tintClass[tint]}`}>
      <span className={styles.dataCardValue}>93 % cieľa</span>
      <div className={styles.adherenceStrip}>
        {days.map((d, i) => (
          <span key={i} className={`${styles.adherenceDot} ${styles[`adherence_${d}`]}`} />
        ))}
      </div>
      <span className={styles.dataCardLabel}>adherencia stravy · 7 dní</span>
    </div>
  );
}

export function ChatCard({ tint = "neutral" }: { tint?: CardTint }) {
  return (
    <div className={`${styles.dataCard} ${tintClass[tint]}`}>
      <div className={styles.chatBubbleRow}>
        <span className={styles.chatBubble}>Koleno v pohode, ťahá skôr chrbát.</span>
      </div>
      <span className={styles.dataCardLabel}>AI kouč, 23:40</span>
    </div>
  );
}

export function StatementCard({ text, tint = "neutral" }: { text: string; tint?: CardTint }) {
  return (
    <div className={`${styles.dataCard} ${styles.statementCard} ${tintClass[tint]}`}>
      <p className={styles.statementText}>{text}</p>
    </div>
  );
}
