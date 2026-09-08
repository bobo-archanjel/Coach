import styles from "../page.module.css";
import type { CardTint } from "./MiniDataCard";

// Distinct card family for the stack-to-fan section — deliberately NOT the
// same components as the marquee (Ring/Macro/Adherence/Chat), which is
// where those debut. Bolder, more graphic treatments, each borrowing a
// well-known dashboard pattern and rebuilding it from real FitPilot data:
// a GitHub-style contribution heatmap, a Stripe/Linear-style big-stat card
// with a sparkline, an iMessage-style two-bubble exchange, and a weekly bar
// chart. Same token-only tint system as MiniDataCard — no new hue.
const tintClass: Record<CardTint, string> = {
  neutral: styles.tintNeutral,
  coral: styles.tintCoral,
  amber: styles.tintAmber,
  moss: styles.tintMoss,
};

// GitHub-style contribution heatmap — 4 weeks × 7 days, intensity mapped to
// the existing coral accent (no new hue), reading directly as "streak".
export function StreakHeatmap({ tint = "coral" }: { tint?: CardTint }) {
  // 0 = rest day, 1-3 = increasing training intensity that day
  const weeks: number[][] = [
    [0, 2, 0, 3, 1, 0, 0],
    [1, 0, 2, 0, 3, 0, 0],
    [0, 3, 0, 2, 0, 1, 0],
    [2, 0, 3, 0, 2, 0, 0],
  ];
  return (
    <div className={`${styles.dataCard} ${styles.bentoCard} ${tintClass[tint]}`}>
      <span className={styles.dataCardValue}>18 tréningov / 4 týždne</span>
      <div className={styles.heatmapGrid}>
        {weeks.flat().map((level, i) => (
          <span key={i} className={styles.heatmapCell} data-level={level} />
        ))}
      </div>
      <span className={styles.dataCardLabel}>séria tréningov, posledný mesiac</span>
    </div>
  );
}

// Big-stat card, Stripe/Linear dashboard idiom: one oversized number, a
// trend delta, a tiny sparkline underneath.
export function BigStatCard({ tint = "moss" }: { tint?: CardTint }) {
  const points = [4, 6, 5, 8, 7, 9, 12];
  const max = Math.max(...points);
  const w = 140;
  const h = 36;
  const step = w / (points.length - 1);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${i * step} ${h - (p / max) * h}`).join(" ");
  return (
    <div className={`${styles.dataCard} ${styles.bentoCard} ${tintClass[tint]}`}>
      <span className={styles.bigStatValue}>+38 %</span>
      <span className={styles.dataCardLabel}>adherencia oproti minulému mesiacu</span>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={styles.sparkline} aria-hidden="true">
        <path d={path} fill="none" stroke="var(--moss)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// Two-message exchange, iMessage-style bubble pair — richer than a single
// floating quote, shows the actual back-and-forth.
export function ConversationExchange({ tint = "neutral" }: { tint?: CardTint }) {
  return (
    <div className={`${styles.dataCard} ${styles.bentoCard} ${tintClass[tint]}`}>
      <div className={styles.exchangeStack}>
        <span className={`${styles.exchangeBubble} ${styles.exchangeIn}`}>Môžem cvičiť s bolesťou v kolene?</span>
        <span className={`${styles.exchangeBubble} ${styles.exchangeOut}`}>Vynechaj drep, RDL skús ľahšie.</span>
      </div>
      <span className={styles.dataCardLabel}>AI kouč, 23:40</span>
    </div>
  );
}

// Weekly volume bar chart — plain analytics-panel idiom, distinct shape
// from the marquee's horizontal macro bars.
export function WeeklyBarChart({ tint = "amber" }: { tint?: CardTint }) {
  const days = [
    { d: "Po", v: 40 },
    { d: "Ut", v: 0 },
    { d: "St", v: 70 },
    { d: "Št", v: 30 },
    { d: "Pi", v: 90 },
    { d: "So", v: 0 },
    { d: "Ne", v: 55 },
  ];
  return (
    <div className={`${styles.dataCard} ${styles.bentoCard} ${tintClass[tint]}`}>
      <span className={styles.dataCardValue}>Objem tréningu</span>
      <div className={styles.barChart}>
        {days.map((d) => (
          <div key={d.d} className={styles.barChartCol}>
            <span className={styles.barChartBar} style={{ height: `${Math.max(d.v, 6)}%` }} />
            <span className={styles.barChartLabel}>{d.d}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
