/*
 * IMPECCABLE DIRECTION CONTRACT — feature/security#2, /v2 landing variant
 *
 * THESIS: this page IS a wearable post-workout recap screen, not a SaaS
 * marketing page wearing fitness icons — refuses the hero+feature-grid+
 * pricing-cards template every AI-generated SaaS landing defaults to.
 * OWN-WORLD: unchanged FitPilot palette (Almost Black/Card Ember/Warm Paper/
 * Signal Coral/Amber/Moss) and Inter — but rendered as readout tiles, HR-zone
 * bars, sparklines and a draw-in progress ring instead of cards/icon tiles.
 * STORY: a trainer sees their whole coaching business rendered the way a
 * wearable renders one workout — legible, quantified, satisfying — and starts
 * the trial to get that clarity for real.
 * FIRST VIEWPORT: one large animated ring (110px radius, coral, draws in on
 * load) with a counting "14" centered, caption below the ring (not above it)
 * — reversed from a normal hero, exactly like a recap screen's big number.
 * FORM: IMPECCABLE'S PICK (own top-ranked candidate, index 1 of 7 grounded
 * structures ordered for this task), seed key 7071a2de, motion via the
 * `motion` package (new dependency, chosen for spring/inView primitives).
 * FINISH: unreviewed and undocumented is unfinished — this is a code-led,
 * unattended-adjacent build without the shipped finish-reviewer/documenter
 * subagents in this harness; verified instead via tsc/build/e2e + manual
 * screenshot inspection (desktop+mobile) before handoff.
 */
import Link from "next/link";
import type { Metadata } from "next";
import { LogoMark } from "../components/LogoMark";
import { RingStat } from "./components/RingStat";
import { ZoneBar } from "./components/ZoneBar";
import { Reveal } from "./components/Reveal";
import { Sparkline } from "./components/Sparkline";
import styles from "./page.module.css";

// Testovacia varianta (feature/security#2) — nie je súčasť produkčného webu,
// nechceme ju indexovať ani zamieňať s hlavným landingom (app/page.tsx, ktorý
// zostáva bezo zmeny).
export const metadata: Metadata = {
  title: "FitPilot — náhľad v2 (interné testovanie)",
  robots: { index: false, follow: false },
};

const ArrowIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
    <path d="M3 7.5h9M8 3l4.5 4.5L8 12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ZONES: { title: string; copy: string; tone: "coral" | "amber" | "moss" }[] = [
  {
    title: "Klienti",
    copy: "Databáza s kontaktmi, cieľmi a zdravotnými obmedzeniami. Vidíš na prvý pohľad, kto meškal s logovaním.",
    tone: "coral",
  },
  {
    title: "Tréning a výživa",
    copy: "Tréningový builder aj makrá na jednom mieste — nie výživa ako platený doplnok, ale rovnocenná súčasť od začiatku.",
    tone: "amber",
  },
  {
    title: "AI s dohľadom trénera",
    copy: "AI navrhuje plán aj odpovede klientovi — posledné slovo má vždy tréner, appka nič neposiela automaticky.",
    tone: "moss",
  },
];

export default function LandingV2() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand}>
            <LogoMark className={styles.logoMark} />
            FitPilot
          </Link>
          <span className={styles.previewBadge}>Náhľad v2</span>
        </div>
      </header>

      <main>
        {/* ---------- hero: recap ring namiesto bežného headline+screenshot heroa ---------- */}
        <section className={styles.hero}>
          <div className={styles.heroRing}>
            <RingStat value={14} label="dní zadarmo" sublabel="skúšobné obdobie, bez viazanosti" />
          </div>
          <h1 className={styles.heroHeadline}>
            Tvoja trénerská prax,
            <br />
            <span className={styles.accent}>čítaná ako recap tréningu.</span>
          </h1>
          <p className={styles.heroSub}>
            FitPilot vedie klientov, plány aj jedálničky pre fitness trénerov na Slovensku a v Česku —
            prehľadne, ako obrazovka po tréningu, nie ako tabuľka.
          </p>
          <Link href="/prihlasenie#register" className={`btn btn-primary ${styles.heroCta}`}>
            Začať skúšobné obdobie
            <ArrowIcon />
          </Link>
        </section>

        {/* ---------- zóny (HR-zone jazyk namiesto feature kariet) ---------- */}
        <section className={styles.section}>
          <Reveal>
            <p className={styles.eyebrow}>Zóny appky</p>
            <h2 className={styles.sectionHead}>Tri zóny, jeden pracovný tok</h2>
          </Reveal>
          <div className={styles.zoneList}>
            {ZONES.map((z, i) => (
              <ZoneBar key={z.title} index={i + 1} title={z.title} copy={z.copy} tone={z.tone} />
            ))}
          </div>
        </section>

        {/* ---------- AI ako "live readout" ---------- */}
        <section className={`${styles.section} ${styles.aiSection}`}>
          <Reveal>
            <p className={styles.eyebrow}>AI blok</p>
            <h2 className={styles.sectionHead}>Kontext, nie generický chatbot</h2>
          </Reveal>
          <div className={styles.readoutGrid}>
            <Reveal delay={0.05} className={styles.readoutTile}>
              <span className={styles.readoutLabel}>Príklad — AI Kouč (klient)</span>
              <p className={styles.readoutQuote}>„Čo mám dnes jesť, ak mi zostáva 400 g bielkovín?“</p>
              <Sparkline points="0,60 40,55 80,40 120,45 160,25 200,30 240,12 280,18" color="var(--plate-yellow)" />
            </Reveal>
            <Reveal delay={0.15} className={styles.readoutTile}>
              <span className={styles.readoutLabel}>Príklad — generátor plánu (tréner)</span>
              <p className={styles.readoutQuote}>„Vygeneruj 4-týždňový silový plán na nabratie svalovej hmoty.“</p>
              <Sparkline points="0,70 40,60 80,58 120,42 160,38 200,22 240,20 280,6" color="var(--iron-red)" />
            </Reveal>
          </div>
          <Reveal delay={0.2}>
            <p className={styles.aiNote}>
              Ilustračné príklady rozhrania — appka nikdy neposiela AI výstup klientovi bez schválenia trénerom.
            </p>
          </Reveal>
        </section>

        {/* ---------- cenník ako "výkonnostné úrovne" trackeru ---------- */}
        <section className={styles.section}>
          <Reveal>
            <p className={styles.eyebrow}>Cenník</p>
            <h2 className={styles.sectionHead}>Predplatné pre trénera, nie pre klienta</h2>
            <p className={styles.pricingNote}>orientačný cenník pre spustenie — ceny sa môžu do launchu upraviť</p>
          </Reveal>
          <div className={styles.tierGrid}>
            {[
              { tier: "Starter", meta: "do 10 klientov", price: "15–20 €" },
              { tier: "Pro", meta: "do 50 klientov", price: "40–50 €", featured: true },
              { tier: "Business", meta: "neobmedzene", price: "80–100 €" },
            ].map((t, i) => (
              <Reveal key={t.tier} delay={i * 0.08} className={`${styles.tierCard} ${t.featured ? styles.tierFeatured : ""}`}>
                <span className={styles.tierName}>{t.tier}</span>
                <span className={styles.tierMeta}>{t.meta}</span>
                <span className={styles.tierPrice}>{t.price}</span>
                <span className={styles.tierPer}>/ mes</span>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ---------- final CTA — prstenec "dokončený" ---------- */}
        <section className={styles.finalCta}>
          <Reveal>
            <RingStat value={100} suffix="%" label="v tvojich rukách" sublabel="AI navrhuje, ty rozhoduješ" size={160} />
            <h2 className={styles.finalHeadline}>Zdvihni administratívu zo svojich pliec.</h2>
            <Link href="/prihlasenie#register" className={`btn btn-primary ${styles.heroCta}`}>
              Začať skúšobné obdobie
              <ArrowIcon />
            </Link>
          </Reveal>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>
          Toto je interná testovacia varianta landing page (feature/security#2) — bežná stránka ostáva na{" "}
          <Link href="/">fitpilot.sk</Link>.
        </p>
      </footer>
    </div>
  );
}
