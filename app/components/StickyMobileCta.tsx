"use client";

import { useEffect, useState } from "react";
import styles from "../page.module.css";

const ArrowIcon = () => (
  <svg width="14" height="14" viewBox="0 0 15 15" fill="none" aria-hidden="true">
    <path d="M3 7.5h9M8 3l4.5 4.5L8 12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Sticky CTA na mobile (feature/security#2) — hero CTA je "above the fold",
 * ale po odscrollovaní zmizne a klient musí scrollovať späť hore, aby sa
 * dostal k akcii. Objaví sa až po prejdení hero sekcie (nie hneď od začiatku
 * — to by len duplikovalo hero CTA a pôsobilo rušivo), zmizne pri návrate
 * úplne hore. Skrytá na desktope cez CSS (`.stickyCta` media query,
 * page.module.css) — hero aj nav CTA sú tam vždy viditeľné bez scrollu.
 */
export function StickyMobileCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setVisible(window.scrollY > window.innerHeight * 0.9);
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className={`${styles.stickyCta} ${visible ? styles.stickyCtaVisible : ""}`} aria-hidden={!visible}>
      <a href="#cennik" className={`btn btn-primary ${styles.stickyCtaBtn}`} tabIndex={visible ? 0 : -1}>
        Začať 14-dňové skúšobné obdobie
        <ArrowIcon />
      </a>
    </div>
  );
}
