"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { RingCard, MacroCard, AdherenceCard, ChatCard, StatementCard, type CardTint } from "./MiniDataCard";
import styles from "../page.module.css";

// Horizontal card marquee, directly under the hero headline. Linear,
// constant-speed CSS keyframe loop (no ease — that's correct for an
// infinite loop, per Kowalski: easing an infinite scroll just makes it look
// like it's stuttering at the seam). `animation-play-state: paused` on
// hover/focus and — per the reduced-motion requirement — a full collapse to
// a static, non-scrolling row, not merely a slower scroll.
const CARDS: { key: string; rotate: number; render: () => ReactNode }[] = [
  { key: "ring", rotate: -4, render: () => <RingCard tint="coral" /> },
  { key: "s1", rotate: 3, render: () => <StatementCard text="AI navrhne prvý draft plánu za pár sekúnd." tint="neutral" /> },
  { key: "macro", rotate: -3, render: () => <MacroCard tint="amber" /> },
  { key: "chat", rotate: 5, render: () => <ChatCard tint="neutral" /> },
  { key: "adherence", rotate: -5, render: () => <AdherenceCard tint="moss" /> },
  { key: "s2", rotate: 4, render: () => <StatementCard text="Klient vidí zmenu plánu okamžite, bez telefonátu." tint="coral" /> },
];

export function MarqueeCards() {
  const reduced = Boolean(useReducedMotion());
  // FOUR copies, not two — with only two, six cards' combined width can be
  // narrower than 2× a wide viewport, so once the first copy scrolls fully
  // off there's a beat of empty track before the second one catches up
  // (the exact gap reported: "reaches the end, the rest draws in late").
  // Four copies + a -25% (one quarter of the four-copy track = exactly one
  // copy width) loop point guarantees the track always comfortably covers
  // more than 2× any realistic viewport.
  const track = [...CARDS, ...CARDS, ...CARDS, ...CARDS];

  return (
    <motion.div
      className={styles.marqueeCardsWrap}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduced ? 0 : 0.5, delay: reduced ? 0 : 0.2, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {/* reduced-motion collapse is CSS-only (`@media (prefers-reduced-motion:
          reduce)` in page.module.css) — never a JS-conditional className,
          since `reduced` can differ between SSR and the client's first
          paint and a mismatched className is exactly the same hydration
          hazard as a mismatched inline style. */}
      <div className={styles.marqueeCardsTrack}>
        {track.map((c, i) => (
          <div key={`${c.key}-${i}`} className={styles.marqueeCardSlot} style={{ transform: `rotate(${c.rotate}deg)` }}>
            {c.render()}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export type { CardTint };
