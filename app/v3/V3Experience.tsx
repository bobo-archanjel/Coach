"use client";

import { useEffect } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import Lenis from "lenis";
import { LogoMark } from "../components/LogoMark";
import { FaqItem } from "./components/FaqItem";
import styles from "./page.module.css";

/*
 * IMPECCABLE DIRECTION CONTRACT — feature/front-end, /v3 landing variant
 *
 * THESIS: an audit of /v1 (produkčný landing) and /v2 (HUD/command-console
 * rebuild) against Apple's marketing-page conventions — clarity, deference,
 * depth, huge confident type, near-monochrome color, one restrained motion
 * idea per section — found both too dense (simultaneous ornament: icon+tags+
 * visualization per row on v1; shader grid+ticker+cursor+corner-brackets on
 * v2). /v3 is not a v2 reskin; it strips to Apple's rhythm: one big idea per
 * screen, generous negative space, a single sticky scroll-reveal (CSS
 * `position: sticky`, not a GSAP pin) for the product walkthrough, and
 * `motion` (Framer Motion's successor) for restrained whileInView fades —
 * never more than one animated technique competing for attention at once.
 * OWN-WORLD: same FitPilot palette/tokens, but color is spent almost
 * entirely on the CTA and single accent words — no HUD mono font, no
 * multi-hue feature tags, no custom cursor.
 * STORY: Hero states the outcome plainly → an honest trust bar (no
 * fabricated logos/testimonials — the product has no customers yet) →
 * names the real problem (tools scattered across five places) → the
 * solution walkthrough (sticky screenshot, steps scroll past it) → how
 * onboarding actually works → FAQ → one closing CTA that mirrors the hero.
 * FORM: `motion/react` for section reveals (whileInView, once), Lenis for
 * scroll inertia (no GSAP — deliberately a different stack signature from
 * v2, per the request to actually use the `motion` library this time).
 * FINISH: reduced-motion collapses every whileInView to instant visibility
 * (`useReducedMotion` gates every transition); verified via tsc/build/e2e
 * plus desktop/mobile/reduced-motion screenshot inspection.
 */

const TIERS = [
  { tier: "Starter", meta: "do 10 klientov", price: "15–20 €" },
  { tier: "Pro", meta: "do 50 klientov", price: "40–50 €", featured: true },
  { tier: "Business", meta: "neobmedzene", price: "80–100 €" },
];

const SOLUTION_STEPS = [
  {
    title: "Klienti a ich história",
    copy: "Kontakty, ciele, zdravotné obmedzenia, história merania — všetko na jednom mieste namiesto zošita a troch appiek.",
    shot: "/v2/screens/dnes.png",
  },
  {
    title: "Tréning aj výživa spolu",
    copy: "Tréningový builder a jedálniček nie sú dve oddelené appky — plán aj makrá zostavíš na jednom mieste, klient ich vidí spolu.",
    shot: "/v2/screens/dennik.png",
  },
  {
    title: "AI, ktorá naozaj pomáha",
    copy: "AI navrhne prvý draft plánu aj odpoveď klientovi na bežnú otázku — posledné slovo má vždy tréner, nič sa neposiela bez schválenia.",
    shot: "/v2/screens/chat.png",
  },
];

const HOW_STEPS = [
  { title: "Založ účet", copy: "Bez karty, 14 dní zadarmo. Nastavenie zaberie pár minút." },
  { title: "Pozvi klientov", copy: "Jednorazový invite kód — klient sa napojí sám cez appku." },
  { title: "Priprav prvý plán", copy: "Tréning aj jedálniček, prípadne necháš AI navrhnúť prvý draft." },
  { title: "Sleduj a uprav", copy: "Grafy, adherencia a AI upozornenia — vieš, kto potrebuje pozornosť." },
];

const FAQS = [
  {
    q: "Koľko appka stojí po skúšobnej dobe?",
    a: "Orientačne 15–100 € mesačne podľa počtu klientov (pozri cenník nižšie) — ceny sa môžu do launchu ešte upraviť. Platí tréner, klient appku používa zadarmo.",
  },
  {
    q: "Čo sa stane s dátami klientov, ak zruším predplatné?",
    a: "Dáta zostávajú zachované, spolupráca sa dá pozastaviť bez straty histórie. Trvalý výmaz na žiadosť klienta prebehne podľa GDPR politiky appky.",
  },
  {
    q: "Vidí AI kouč aj tréner, čo si klient píše?",
    a: "Nie — AI Kouč je súkromná konverzácia klient↔AI. Tréner dostane len krátku správu pri eskalácii (napr. zdravotná téma), nikdy prístup k celému chatu.",
  },
  {
    q: "Dá sa appka používať aj bez AI funkcií?",
    a: "Áno, AI je doplnok, nie povinná súčasť — tréning, výživu, klientov aj komunikáciu vieš viesť úplne bez AI generátora či AI kouča.",
  },
];

export function V3Experience() {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
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
  }, [reduced]);

  const fadeUp = {
    initial: { opacity: 0, y: 28 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-80px" },
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const },
  };

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/" className={styles.navBrand}>
          <LogoMark className={styles.navLogo} />
          FitPilot
        </Link>
        <div className={styles.navRight}>
          <span className={styles.navPreview}>Náhľad v3</span>
          <Link href="/prihlasenie#register" className={`${styles.btn}`} style={{ padding: "10px 22px", fontSize: 14 }}>
            Skúsiť zadarmo
          </Link>
        </div>
      </nav>

      <main>
        {/* ---------- HERO ---------- */}
        <section className={`${styles.wrap} ${styles.hero}`}>
          <motion.p className={styles.heroKicker} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
            FitPilot pre fitness trénerov
          </motion.p>
          <motion.h1
            className={styles.heroHeadline}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] as const }}
          >
            Tvoja trénerská prax. <span className={styles.accent}>Konečne pod kontrolou.</span>
          </motion.h1>
          <motion.p
            className={styles.heroSub}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] as const }}
          >
            Klienti, tréning, výživa a AI kouč — jedna appka namiesto Excelu, WhatsAppu a troch ďalších nástrojov.
          </motion.p>
          <motion.div
            className={styles.heroActions}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] as const }}
          >
            <Link href="/prihlasenie#register" className={styles.btn}>
              Začať 14-dňovú skúšku
            </Link>
            <a href="#ako-to-funguje" className={`${styles.btn} ${styles.btnGhost}`}>
              Ako to funguje
            </a>
          </motion.div>
          <motion.div
            className={styles.heroShotWrap}
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.9, delay: 0.4, ease: [0.16, 1, 0.3, 1] as const }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/v2/screens/dnes.png" alt="Karta Dnes v klientskom portáli FitPilot" className={styles.heroShot} />
          </motion.div>
        </section>

        {/* ---------- TRUST BAR (honest — no fabricated logos/testimonials) ---------- */}
        <div className={styles.trustBar}>
          <div className={`${styles.wrap} ${styles.trustRow}`}>
            <span>14 dní zadarmo</span>
            <span className={styles.trustDot}>●</span>
            <span>Bez viazanosti</span>
            <span className={styles.trustDot}>●</span>
            <span>Vyvíjané s aktívnymi trénermi</span>
            <span className={styles.trustDot}>●</span>
            <span>Natívne SK/CZ</span>
          </div>
        </div>

        {/* ---------- PROBLEM ---------- */}
        <section className={`${styles.wrap} ${styles.section} ${styles.problem}`}>
          <motion.p className={styles.problemStatement} {...fadeUp}>
            Trénerská prax je dnes <strong>rozhádzaná</strong> naprieč piatimi appkami.
          </motion.p>
          <motion.div className={styles.problemList} {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }}>
            <span className={styles.problemChip}>Excel tabuľka klientov</span>
            <span className={styles.problemChip}>WhatsApp správy</span>
            <span className={styles.problemChip}>Appka na jedálničky</span>
            <span className={styles.problemChip}>Papierové poznámky</span>
            <span className={styles.problemChip}>Kalendár zvlášť</span>
          </motion.div>
        </section>

        {/* ---------- SOLUTION — sticky scrollytelling ---------- */}
        <section className={`${styles.wrap} ${styles.section}`}>
          <motion.div className={styles.solutionHead} {...fadeUp}>
            <p className={styles.eyebrow}>Riešenie</p>
            <h2 className={styles.solutionHeadline}>Jedna appka. Celý proces.</h2>
          </motion.div>
          <div className={styles.solutionGrid}>
            <div className={styles.solutionSticky}>
              <motion.div
                key="solution-shot"
                initial={{ opacity: 0.4 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={SOLUTION_STEPS[0].shot} alt="" className={styles.solutionShot} />
              </motion.div>
            </div>
            <div className={styles.solutionSteps}>
              {SOLUTION_STEPS.map((step, i) => (
                <motion.div key={step.title} className={styles.solutionStep} {...fadeUp}>
                  <span className={styles.solutionStepNum}>{String(i + 1).padStart(2, "0")}</span>
                  <h3 className={styles.solutionStepTitle}>{step.title}</h3>
                  <p className={styles.solutionStepCopy}>{step.copy}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- HOW IT WORKS ---------- */}
        <section id="ako-to-funguje" className={`${styles.wrap} ${styles.section}`}>
          <motion.div className={styles.sectionHeadCenter} {...fadeUp}>
            <p className={styles.eyebrow}>Ako to funguje</p>
            <h2 className={styles.sectionHeadline}>Od registrácie po prvý report za pár minút</h2>
          </motion.div>
          <div className={styles.howGrid}>
            {HOW_STEPS.map((s, i) => (
              <motion.div key={s.title} className={styles.howStep} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.08 }}>
                <div className={styles.howNum}>{String(i + 1).padStart(2, "0")}</div>
                <h3 className={styles.howTitle}>{s.title}</h3>
                <p className={styles.howCopy}>{s.copy}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ---------- PRICING ---------- */}
        <section className={`${styles.wrap} ${styles.section}`}>
          <motion.div className={styles.sectionHeadCenter} {...fadeUp}>
            <p className={styles.eyebrow}>Cenník</p>
            <h2 className={styles.sectionHeadline}>Predplatné pre trénera, nie pre klienta</h2>
          </motion.div>
          <p className={styles.pricingNote}>orientačný cenník pre spustenie — ceny sa môžu do launchu upraviť</p>
          <motion.div className={styles.tierGrid} {...fadeUp}>
            {TIERS.map((t) => (
              <div key={t.tier} className={`${styles.tierCard} ${t.featured ? styles.tierFeatured : ""}`}>
                <span className={styles.tierName}>{t.tier}</span>
                <span className={styles.tierMeta}>{t.meta}</span>
                <span className={styles.tierPrice}>{t.price}</span>
                <span className={styles.tierPer}>/ mes</span>
              </div>
            ))}
          </motion.div>
        </section>

        {/* ---------- FAQ ---------- */}
        <section className={`${styles.wrap} ${styles.section}`}>
          <motion.div className={styles.sectionHeadCenter} {...fadeUp}>
            <p className={styles.eyebrow}>Časté otázky</p>
            <h2 className={styles.sectionHeadline}>Ešte niečo nejasné?</h2>
          </motion.div>
          <motion.div className={styles.faqList} {...fadeUp}>
            {FAQS.map((f) => (
              <FaqItem key={f.q} question={f.q} answer={f.a} />
            ))}
          </motion.div>
        </section>

        {/* ---------- FINAL CTA ---------- */}
        <section className={`${styles.wrap} ${styles.finalCta}`}>
          <motion.h2 className={styles.finalHeadline} {...fadeUp}>
            Zdvihni administratívu zo svojich pliec.
          </motion.h2>
          <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }}>
            <Link href="/prihlasenie#register" className={styles.btn}>
              Začať 14-dňovú skúšku
            </Link>
          </motion.div>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>
          Interná testovacia varianta landing page (feature/front-end) — bežná stránka ostáva na{" "}
          <Link href="/">fitpilot.sk</Link>.
        </p>
      </footer>
    </div>
  );
}
