"use client";

import { useEffect } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import Lenis from "lenis";
import { LogoMark } from "../components/LogoMark";
import { MagneticButton } from "./components/MagneticButton";
import { MarqueeCards } from "./components/MarqueeCards";
import { MarqueeText } from "./components/MarqueeText";
import { StackFanCards } from "./components/StackFanCards";
import { PortraitReveal } from "./components/PortraitReveal";
import { ChapterBreak } from "./components/ChapterBreak";
import { ControlCenterPanel } from "./components/ControlCenterPanel";
import styles from "./page.module.css";

/*
 * IMPECCABLE DIRECTION CONTRACT — app/v4, "POLAO adaptation" redesign
 *
 * THESIS: a direct, disciplined port of a reference fitness/wellness
 * landing page's STRUCTURE and RHYTHM — not a loose "inspired by" pass.
 * The reference's actual value is its tempo: fast marquee → calm text
 * block → dominant cinematic visual → marquee again → cards → cinematic
 * close. That alternation (motion, then a long hold) is what reads as
 * premium instead of effect-after-effect, and it's reproduced here beat for
 * beat, with FitPilot's real content standing in for the reference's stock
 * athlete photography.
 * STRUCTURE (matches the reference 1:1): Hero (3-line variable-weight
 * headline + immediate card marquee) → text marquee → "Skutočný progres"
 * (calm text, the pause after two fast beats) → "Prekresľujeme [X]"
 * (two-weight headline left, dominant real visual right) → stack-to-fan
 * cards → vertical scroll-linked reveal (denník) → "Všetko na jednom
 * mieste" (second word dimmed, per the reference's "Membership" treatment)
 * → cinematic chapter-break #1 → text marquee #2 → "Ako to funguje" →
 * cinematic chapter-break #2 as the close (this is the reference's own
 * "repeats twice" pattern: once before the final how-it-works beat, once
 * as the actual ending).
 * CONTENT SWAP: every chapter-break and "Prekresľujeme" visual is a real,
 * dramatically cropped product screenshot (progress ring, AI-coach chat,
 * food diary) — never a browser-framed thumbnail, never a fabricated
 * client (PRODUCT.md bans invented people/testimonials). Marquee/stack
 * cards carry real product-data mini-visualizations (ring, macro bars,
 * adherence dots) or short factual statements, replacing the reference's
 * athlete-photo cards.
 * PALETTE: DESIGN.md's tokens only — no new hue. Card variety within the
 * marquee/stack comes from `color-mix()` blending an existing accent into
 * --ink-2/--ink-3 (see MiniDataCard's tint variants), never from a new
 * color family, and each tint still respects "one accent, one role" (coral
 * = progress/action, amber = trainer context, moss = done).
 * MOTION (measured from the reference, not estimated): marquees are linear/
 * constant-speed CSS loops, paused on hover/focus; the stack-fan holds
 * static ~375ms, fans out over ~550ms on a decelerate-only curve
 * (cubic-bezier(0.16,1,0.3,1) — no overshoot) staggered ~120ms per card,
 * documented in StackFanCards.tsx. Every other reveal uses Apple's default
 * cubic-bezier(0.25,0.1,0.25,1). The video's literal frame-hold timings
 * (e.g. "visual holds 2-2.5s before headline") don't transfer 1:1 to a
 * scroll-driven page — here that hold becomes generous section spacing and
 * viewport-margin thresholds, so a visitor scrolling at a normal pace
 * experiences the same "breathe before it reveals" pacing, documented per
 * component rather than faked with a fixed timer.
 * STABILITY: no R3F/Canvas anywhere in this version — nothing to gate with
 * frameloop/IntersectionObserver. `padding` is longhand top/bottom only
 * everywhere `.wrap` is combined on the same element (the /v3 mobile-margin
 * bug). Every motion transition's duration is gated on `useReducedMotion()`
 * (not a subset); marquees collapse to a fully static, non-scrolling row
 * under `prefers-reduced-motion` via CSS, not just a slower loop.
 * FIGMA: checked via the Figma MCP server before writing any CSS — still
 * not reachable in this session (registered in project config last turn,
 * needs a fresh session + the Figma desktop app running with Dev Mode MCP
 * enabled). DESIGN.md is used as its own documented fallback source of
 * truth for the brand kit, per DESIGN.md's own instruction.
 */

export function V4Experience() {
  const rawReduced = useReducedMotion();
  const reduced = Boolean(rawReduced);
  const ease = [0.25, 0.1, 0.25, 1] as const;

  useEffect(() => {
    // `reduced` is `null` until useReducedMotion resolves client-side —
    // wait for an actual `false`, don't treat the transient `null` as "not
    // reduced" (that briefly spun up Lenis for reduced-motion visitors).
    if (rawReduced !== false) return;
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    let rafId: number;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, [rawReduced]);

  const fadeUp = (delay = 0) => ({
    initial: { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-100px" },
    transition: { duration: reduced ? 0 : 0.7, delay: reduced ? 0 : delay, ease },
  });

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/" className={styles.navBrand}>
          <LogoMark className={styles.navLogo} />
          FitPilot
        </Link>
        <div className={styles.navRight}>
          <span className={styles.navPreview}>Náhľad v4</span>
          <Link href="/prihlasenie#register" className={styles.btn} style={{ padding: "10px 22px", fontSize: 14 }}>
            Skúsiť zadarmo
          </Link>
        </div>
      </nav>

      <main>
        {/* ---------- HERO — 3-line variable-weight headline + card marquee ---------- */}
        <section className={`${styles.wrap} ${styles.hero}`}>
          <motion.h1
            className={styles.heroHeadline}
            initial={{ opacity: 0, scale: 1.04, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: reduced ? 0 : 0.9, ease }}
          >
            <span className={styles.heroLineLight}>Appka, ktorá myslí ako</span>
            <span className={styles.heroLineBold}>skúsený tréner</span>
            <span className={styles.heroLineBold}>
              a AI kouč zároveň<span className={styles.heroDot} aria-hidden="true" />
            </span>
          </motion.h1>
        </section>

        <MarqueeCards />
        <MarqueeText
          phrases={["Menej administratívy", "Viac tréningu", "Rýchlejšie odpovede", "Jasnejší progres"]}
        />

        {/* ---------- REAL PROGRESS — calm pause after two fast beats ---------- */}
        <section className={`${styles.wrap} ${styles.section} ${styles.calmSection}`}>
          <motion.h2 className={styles.calmHeadline} {...fadeUp()}>
            Skutočný progres, nie len tabuľka.
          </motion.h2>
          <motion.p className={styles.calmText} {...fadeUp(0.1)}>
            Každé číslo v appke — odcvičené tréningy, príjem makier, adherencia — pochádza zo skutočných záznamov
            klienta, nie z odhadu. Tréner vidí presne to, čo sa reálne stalo od posledného kontaktu.
          </motion.p>
        </section>

        {/* ---------- WE'RE REDEFINING — headline left, dominant visual right ---------- */}
        <section className={`${styles.wrap} ${styles.section}`}>
          <div className={styles.splitGrid}>
            <motion.div className={styles.splitText} {...fadeUp()}>
              <h2 className={styles.splitHeadline}>
                <span className={styles.heroLineLight}>Prekresľujeme</span>
                <span className={styles.heroLineBold}>AI kouča</span>
              </h2>
              <p className={styles.calmText}>
                Klient sa môže súkromne opýtať čokoľvek, kedykoľvek. Tréner dostane len krátke FYI pri eskalácii —
                zdravotná téma, bolesť, nezvyčajný pokles výkonu. Zvyšok chatu zostáva medzi klientom a AI.
              </p>
            </motion.div>
            <motion.div className={styles.splitVisual} {...fadeUp(0.15)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/v2/screens/chat.png"
                alt="Konverzácia s AI koučom v appke FitPilot"
                className={styles.splitVisualImg}
                style={{ objectPosition: "50% 24%" }}
              />
            </motion.div>
          </div>
        </section>

        {/* ---------- STACK → FAN ---------- */}
        <section className={`${styles.wrap} ${styles.section}`}>
          <motion.h2 className={styles.sectionHeadline} {...fadeUp()}>
            Všetky dáta, na jednom mieste
          </motion.h2>
          <StackFanCards />
        </section>

        {/* ---------- PORTRAIT REVEAL — scroll-linked, not autoplay ---------- */}
        <PortraitReveal />

        {/* ---------- ALL IN ONE — second word dimmed ---------- */}
        <section className={`${styles.wrap} ${styles.section}`}>
          <motion.h2 className={styles.allInOneHeadline} {...fadeUp()}>
            Všetko v jednej <span className={styles.allInOneDim}>appke</span>
          </motion.h2>
          <motion.p className={styles.calmText} {...fadeUp(0.1)} style={{ margin: "0 auto 40px", textAlign: "center" }}>
            Klienti, tréningy, výživa, komunikácia a AI kouč — bez prepínania medzi piatimi nástrojmi.
          </motion.p>
          <motion.div {...fadeUp(0.2)}>
            <ControlCenterPanel />
          </motion.div>
        </section>

        {/* ---------- CHAPTER BREAK #1 — before How It Works ---------- */}
        <ChapterBreak
          src="/v2/screens/dnes.png"
          alt="Prstenec postupu dnešného tréningu v appke FitPilot"
          objectPosition="50% 44%"
          headline="Postup, na prvý pohľad."
          glow="coral"
        />

        <MarqueeText phrases={["Bez Excelu", "Bez WhatsAppu", "Bez papierových poznámok", "Jedna appka"]} />

        {/* ---------- HOW IT WORKS — closes the sequence ---------- */}
        <section id="ako-to-funguje" className={`${styles.wrap} ${styles.section}`}>
          <div className={styles.splitGrid}>
            <motion.div className={styles.splitText} {...fadeUp()}>
              <h2 className={styles.splitHeadline}>
                <span className={styles.heroLineLight}>Ako to</span>
                <span className={styles.heroLineBold}>funguje</span>
              </h2>
              <ol className={styles.howList}>
                <li>Založ účet, 14 dní zadarmo, bez karty.</li>
                <li>Pozvi klientov jednorazovým invite kódom.</li>
                <li>Priprav prvý plán — tréning aj jedálniček, prípadne necháš AI navrhnúť draft.</li>
                <li>Sleduj adherenciu a AI upozornenia, uprav, čo treba.</li>
              </ol>
            </motion.div>
            <motion.div className={styles.splitVisual} {...fadeUp(0.15)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/v2/screens/dennik.png"
                alt="Denník príjmu v klientskom portáli FitPilot"
                className={styles.splitVisualImg}
                style={{ objectPosition: "50% 10%" }}
              />
            </motion.div>
          </div>
        </section>

        {/* ---------- CHAPTER BREAK #2 — closing ---------- */}
        <ChapterBreak
          src="/v2/screens/dnes.png"
          alt="Tlačidlo Začať tréning v klientskom portáli FitPilot"
          objectPosition="50% 58%"
          headline="Zdvihni administratívu zo svojich pliec."
          sub="14 dní zadarmo, bez karty, bez viazanosti."
          glow="coral"
        >
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: reduced ? 0 : 0.6, delay: reduced ? 0 : 0.3, ease }}
          >
            <MagneticButton>
              <Link href="/prihlasenie#register" className={styles.btn}>
                Začať 14-dňovú skúšku
              </Link>
            </MagneticButton>
          </motion.div>
        </ChapterBreak>
      </main>

      <footer className={styles.footer}>
        <p>
          Interná testovacia varianta landing page (app/v4) — bežná stránka ostáva na{" "}
          <Link href="/">fitpilot.sk</Link>.
        </p>
      </footer>
    </div>
  );
}
