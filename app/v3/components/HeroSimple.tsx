"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { PhoneHero } from "./PhoneHero";
import { StatChips } from "./StatChips";
import { MagneticButton } from "./MagneticButton";
import styles from "../page.module.css";

// Apple product-page hero, restrained per the actual research (not the
// gimmick-heavy first attempt): scroll drives everything directly (no
// pin/scroll-jack that blocks the view), depth comes from a SMALL speed
// difference between layers — "a few dozen pixels over a full viewport of
// scrolling" — not from one giant element dominating the screen. Apple's
// own documented easing (cubic-bezier(0.25, 0.1, 0.25, 1)) replaces the
// steeper expo-out curve used elsewhere, specifically for this hero's
// mount-in.
//
// Three depth layers, each visibly slower than the next:
//   1. heroGlow   — slowest (~100px) + a faint "light sweep" drift, the
//      AirPods Pro shifting-light idea, using only the existing accent hue
//   2. the phone  — scroll-driven turn, PLUS a cursor-parallax tilt that
//      keeps it alive at rest, not only while scrolling
//   3. stat chips — fastest, but eased back to ~50-60px (was 220px in the
//      first pass) — once a visitor consciously notices the mechanic, per
//      the research, it needs to be toned down, not amplified
export function HeroSimple() {
  const reduced = useReducedMotion();
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress: heroProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const glowY = useTransform(heroProgress, [0, 1], [0, 100]);
  const glowX = useTransform(heroProgress, [0, 1], [0, 26]);
  const glowScale = useTransform(heroProgress, [0, 1], [1, 1.06]);
  const ease = [0.25, 0.1, 0.25, 1] as const; // Apple's own documented default curve

  return (
    <section ref={heroRef} className={`${styles.wrap} ${styles.hero}`}>
      <motion.div
        className={styles.heroGlow}
        style={reduced ? undefined : { y: glowY, x: glowX, scale: glowScale }}
        aria-hidden="true"
        suppressHydrationWarning
      />
      <div className={styles.heroInner}>
        <div className={styles.heroText}>
          <motion.p className={styles.heroKicker} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
            FitPilot pre fitness trénerov
          </motion.p>
          <motion.h1
            className={styles.heroHeadline}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease }}
          >
            Tvoja trénerská prax. <span className={styles.accent}>Konečne pod kontrolou.</span>
          </motion.h1>
          <motion.p
            className={styles.heroSub}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease }}
          >
            Klienti, tréning, výživa a AI kouč — jedna appka namiesto Excelu, WhatsAppu a troch ďalších nástrojov.
          </motion.p>
          <motion.div
            className={styles.heroActions}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease }}
          >
            <MagneticButton>
              <Link href="/prihlasenie#register" className={styles.btn}>
                Začať 14-dňovú skúšku
              </Link>
            </MagneticButton>
            <a href="#ako-to-funguje" className={`${styles.btn} ${styles.btnGhost}`}>
              Ako to funguje
            </a>
          </motion.div>
        </div>
        <motion.div
          className={styles.heroVisual}
          initial={{ opacity: 0, y: 40, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.4, ease }}
        >
          <PhoneHero progress={heroProgress} />
          <StatChips progress={heroProgress} start />
        </motion.div>
      </div>
    </section>
  );
}
