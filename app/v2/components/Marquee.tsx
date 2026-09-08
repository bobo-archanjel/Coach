"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import styles from "../page.module.css";

/**
 * Nekonečná kinetická typografia — HUD ticker pás. Dve kópie obsahu vedľa
 * seba, `xPercent` sa lineárne posúva -50%→0% v slučke (jednoduchší a
 * lacnejší vzor než meranie šírky textu). Pri `prefers-reduced-motion` sa
 * animácia nespúšťa vôbec — pás zostáva statický, čitateľný text.
 */
export function Marquee({ items, speed = 32 }: { items: string[]; speed?: number }) {
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !trackRef.current) return;
    const tween = gsap.fromTo(trackRef.current, { xPercent: 0 }, { xPercent: -50, duration: speed, ease: "none", repeat: -1 });
    return () => {
      tween.kill();
    };
  }, [speed]);

  const content = (
    <>
      {items.map((item, i) => (
        <span key={i} className={styles.marqueeItem}>
          {item}
          <span className={styles.marqueeDot} aria-hidden="true">
            ◆
          </span>
        </span>
      ))}
    </>
  );

  return (
    <div className={styles.marquee} aria-hidden="true">
      <div ref={trackRef} className={styles.marqueeTrack}>
        <div className={styles.marqueeGroup}>{content}</div>
        <div className={styles.marqueeGroup}>{content}</div>
      </div>
    </div>
  );
}
