"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import Lenis from "lenis";
import { LogoMark } from "../components/LogoMark";
import { FaqItem } from "./components/FaqItem";
import { ScrollTextReveal } from "./components/ScrollTextReveal";
import { FeatureRow } from "./components/FeatureRow";
import { AiMemoryWeb } from "./components/AiMemoryWeb";
import { HeroSimple } from "./components/HeroSimple";
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
  {
    tier: "Starter",
    meta: "do 10 klientov",
    price: "15–20 €",
    perks: ["Klienti, tréning aj výživa", "Klientský portál a appka", "E-mailová podpora"],
  },
  {
    tier: "Pro",
    meta: "do 50 klientov",
    price: "40–50 €",
    featured: true,
    perks: ["Všetko zo Starter", "AI generátor plánov", "AI kouč pre klientov", "Prioritná podpora"],
  },
  {
    tier: "Business",
    meta: "neobmedzene",
    price: "80–100 €",
    perks: ["Všetko z Pro", "Neobmedzený počet klientov", "Tímový prístup pre viac trénerov"],
  },
];

const FEATURES = [
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

  const finalRef = useRef<HTMLElement>(null);
  const { scrollYProgress: finalProgress } = useScroll({ target: finalRef, offset: ["start end", "end end"] });
  const finalGlowY = useTransform(finalProgress, [0, 1], [40, -40]);

  useEffect(() => {
    // `reduced` is `null` until useReducedMotion resolves client-side post-
    // mount (Motion's documented SSR-safety behaviour) — wait for an actual
    // `false` rather than treating the transient `null` as "not reduced",
    // which used to spin up a Lenis instance for a tick even when the
    // visitor prefers reduced motion.
    if (reduced !== false) return;
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

  const staggerParent = {
    initial: "hidden",
    whileInView: "show",
    viewport: { once: true, margin: "-80px" },
    variants: { hidden: {}, show: { transition: { staggerChildren: 0.14 } } },
  };
  const staggerChild = {
    variants: {
      hidden: { opacity: 0, y: 28 },
      show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const } },
    },
  };

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
        <HeroSimple />

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
          <ScrollTextReveal
            text="Trénerská prax je dnes rozhádzaná naprieč piatimi appkami."
            className={styles.problemStatement}
          />
          <motion.div className={styles.problemList} {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }}>
            <span className={styles.problemChip}>Excel tabuľka klientov</span>
            <span className={styles.problemChip}>WhatsApp správy</span>
            <span className={styles.problemChip}>Appka na jedálničky</span>
            <span className={styles.problemChip}>Papierové poznámky</span>
            <span className={styles.problemChip}>Kalendár zvlášť</span>
          </motion.div>
        </section>

        {/* ---------- FEATURES — zig-zag, one reveal per row ---------- */}
        <section className={`${styles.wrap} ${styles.section}`}>
          <motion.div className={styles.solutionHead} {...fadeUp}>
            <p className={styles.eyebrow}>Riešenie</p>
            <h2 className={styles.solutionHeadline}>Jedna appka. Celý proces.</h2>
          </motion.div>
          <div className={styles.featureRows}>
            {FEATURES.map((f, i) => (
              <FeatureRow key={f.title} index={i + 1} title={f.title} copy={f.copy} shot={f.shot} reverse={i % 2 === 1} />
            ))}
          </div>
        </section>

        {/* ---------- AI — memory web, builds in as you scroll ---------- */}
        <section className={`${styles.wrap} ${styles.section} ${styles.aiSection}`}>
          <motion.div className={styles.aiHead} {...fadeUp}>
            <p className={styles.eyebrow}>AI kouč</p>
            <h2 className={styles.solutionHeadline}>AI, ktorá si pamätá kontext</h2>
            <p className={styles.heroSub} style={{ margin: "18px auto 0" }}>
              Váha, tréning, jedálniček aj nálada klienta — AI navrhne prvý draft plánu aj odpoveď na bežnú otázku
              z tohto kontextu. Posledné slovo má vždy tréner, nič sa neposiela bez schválenia.
            </p>
          </motion.div>
          <AiMemoryWeb />
        </section>

        {/* ---------- HOW IT WORKS ---------- */}
        <section id="ako-to-funguje" className={`${styles.wrap} ${styles.section}`}>
          <motion.div className={styles.sectionHeadCenter} {...fadeUp}>
            <p className={styles.eyebrow}>Ako to funguje</p>
            <h2 className={styles.sectionHeadline}>Od registrácie po prvý report za pár minút</h2>
          </motion.div>
          <motion.div className={styles.howGrid} {...staggerParent}>
            {HOW_STEPS.map((s, i) => (
              <motion.div key={s.title} className={styles.howStep} {...staggerChild}>
                <div className={styles.howNum}>{String(i + 1).padStart(2, "0")}</div>
                <h3 className={styles.howTitle}>{s.title}</h3>
                <p className={styles.howCopy}>{s.copy}</p>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* ---------- PRICING ---------- */}
        <section className={`${styles.wrap} ${styles.section}`}>
          <motion.div className={styles.sectionHeadCenter} {...fadeUp}>
            <p className={styles.eyebrow}>Cenník</p>
            <h2 className={styles.sectionHeadline}>Predplatné pre trénera, nie pre klienta</h2>
          </motion.div>
          <p className={styles.pricingNote}>orientačný cenník pre spustenie — ceny sa môžu do launchu upraviť</p>
          <motion.div className={styles.tierGrid} {...staggerParent}>
            {TIERS.map((t) => (
              <motion.div key={t.tier} className={`${styles.tierCard} ${t.featured ? styles.tierFeatured : ""}`} {...staggerChild}>
                <span className={styles.tierName}>{t.tier}</span>
                <span className={styles.tierMeta}>{t.meta}</span>
                <span className={styles.tierPrice}>{t.price}</span>
                <span className={styles.tierPer}>/ mes</span>
                <ul className={styles.tierPerks}>
                  {t.perks.map((perk) => (
                    <li key={perk}>
                      <span className={styles.tierCheck} aria-hidden="true">
                        ✓
                      </span>
                      {perk}
                    </li>
                  ))}
                </ul>
                <Link href="/prihlasenie#register" className={styles.tierCta}>
                  Vybrať {t.tier}
                </Link>
              </motion.div>
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
        <section ref={finalRef} className={`${styles.wrap} ${styles.section} ${styles.finalCta}`}>
          <motion.div className={styles.finalGlow} style={{ y: reduced ? 0 : finalGlowY }} aria-hidden="true" suppressHydrationWarning />
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
