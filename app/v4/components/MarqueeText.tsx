"use client";

import styles from "../page.module.css";

// One-line, large tracked-letter phrase loop. Same linear/constant-speed
// principle as the card marquee, same reduced-motion collapse (CSS handles
// both — see `.textMarquee*` rules in page.module.css).
//
// FOUR copies, not two: with only two, a single copy's rendered width can
// be narrower than the viewport (short phrase lists on a wide screen) —
// the track (2× that width) is then narrower than 2× the viewport, so once
// the first copy scrolls fully off, there's a beat of empty space before
// the second one catches up to cover the gap. Four copies guarantee the
// track is always comfortably wider than 2× any realistic viewport, so the
// loop point (-25%, i.e. one quarter of the four-copy track = exactly one
// copy width) never runs out of content to show.
export function MarqueeText({ phrases }: { phrases: string[] }) {
  const line = phrases.join(" · ") + " · ";
  return (
    <div className={styles.textMarqueeWrap} aria-hidden="true">
      <div className={styles.textMarqueeTrack}>
        <span className={styles.textMarqueeItem}>{line}</span>
        <span className={styles.textMarqueeItem}>{line}</span>
        <span className={styles.textMarqueeItem}>{line}</span>
        <span className={styles.textMarqueeItem}>{line}</span>
      </div>
    </div>
  );
}
