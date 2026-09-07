"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { LogoMark } from "../components/LogoMark";
import { Preloader } from "./components/Preloader";
import { SmoothScroll } from "./components/SmoothScroll";
import { Scene3D } from "./components/Scene3D";
import { RingStat } from "./components/RingStat";
import { sceneState } from "./lib/sceneState";
import styles from "./page.module.css";

gsap.registerPlugin(ScrollTrigger, SplitText);

const ArrowIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
    <path d="M3 7.5h9M8 3l4.5 4.5L8 12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ZONES: { title: string; copy: string; tone: "coral" | "amber" | "moss" }[] = [
  { title: "Klienti", copy: "Databáza s kontaktmi, cieľmi a zdravotnými obmedzeniami. Vidíš, kto meškal s logovaním.", tone: "coral" },
  { title: "Tréning a výživa", copy: "Tréningový builder aj makrá na jednom mieste — výživa ako rovnocenná súčasť od začiatku.", tone: "amber" },
  { title: "AI s dohľadom trénera", copy: "AI navrhuje plán aj odpovede klientovi — posledné slovo má vždy tréner.", tone: "moss" },
];

const TIERS = [
  { tier: "Starter", meta: "do 10 klientov", price: "15–20 €" },
  { tier: "Pro", meta: "do 50 klientov", price: "40–50 €", featured: true },
  { tier: "Business", meta: "neobmedzene", price: "80–100 €" },
];

export function V2Experience() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId: number;
    const ctx = gsap.context(() => {
      // ---------- globálny progress (0..1 cez celú stránku) ----------
      ScrollTrigger.create({
        trigger: rootRef.current,
        start: "top top",
        end: "bottom bottom",
        onUpdate: (self) => {
          sceneState.progress = self.progress;
        },
      });

      // ---------- HERO: char-split headline reveal, pinned ----------
      // Reveal beží AUTOMATICKY hneď po preloaderi (nie viazaný na scrub) — pri
      // scrub-driven vzore by pri príchode na stránku (scroll = 0) nebol vidieť
      // žiadny nadpis, len 3D atlét, kým používateľ nezačne scrollovať. Pin tu
      // len drží hero sekciu na mieste počas úvodného kúska scrollu, neriadi obsah.
      const heroSplit = new SplitText(".v2-hero-headline", { type: "chars" });
      gsap.set(heroSplit.chars, { yPercent: 120, opacity: 0 });
      const heroTl = gsap.timeline({ paused: true });
      heroTl
        .to(heroSplit.chars, { yPercent: 0, opacity: 1, stagger: 0.02, ease: "power3.out" })
        .to(`.${styles.heroSub}, .${styles.heroCta}`, { opacity: 1, y: 0, stagger: 0.08 }, "-=0.2")
        .to(`.${styles.heroBadge}`, { opacity: 1, scale: 1 }, "<");

      ScrollTrigger.create({ trigger: ".v2-hero", start: "top top", end: "+=60%", pin: true });

      // sceneState.ready sa nastaví v Preloaderi (buď po ~1.5s animácii, alebo
      // okamžite pri prefers-reduced-motion) — polling cez rAF namiesto custom
      // eventu, nech poradie mountu Preloader vs. tento efekt nikdy nezáleží.
      const waitForReady = () => {
        if (sceneState.ready) {
          heroTl.play();
          return;
        }
        rafId = requestAnimationFrame(waitForReady);
      };
      waitForReady();

      // ---------- ZONES: pripnuté, pruhy sa napĺňajú postupne so scrollom ----------
      gsap.timeline({
        scrollTrigger: { trigger: ".v2-zones", start: "top top", end: "+=120%", pin: true, scrub: 0.6 },
      })
        .from(".v2-zones-head", { opacity: 0, y: 30 })
        .to(`.${styles.zoneFill}`, { scaleX: 1, stagger: 0.5, ease: "none" }, "<0.1");

      // ---------- PRODUCT: pripnuté, telefón (3D) rotuje/mení obrazovky cez sceneState ----------
      gsap.timeline({
        scrollTrigger: { trigger: ".v2-product", start: "top top", end: "+=140%", pin: true, scrub: 0.6 },
      }).to(".v2-product-caption", { opacity: 1, duration: 0.3 }).to(".v2-product-caption", { opacity: 1, duration: 0.7 });

      // ---------- AI + PRICING + FINAL: bežný reveal-on-enter (nie pin) ----------
      gsap.utils.toArray<HTMLElement>(".v2-reveal").forEach((el) => {
        gsap.from(el, {
          opacity: 0,
          y: 32,
          duration: 0.8,
          ease: "power2.out",
          scrollTrigger: { trigger: el, start: "top 85%" },
        });
      });
      gsap.from(".v2-tier-card", {
        opacity: 0,
        y: 40,
        scale: 0.94,
        duration: 0.7,
        stagger: 0.12,
        ease: "power2.out",
        scrollTrigger: { trigger: ".v2-tier-grid", start: "top 80%" },
      });

      // ---------- ktorá sekcia je aktívna (pre 3D scénu) ----------
      // AŽ PO pinoch vyššie — pin vkladá pin-spacer a mení layout ostatných
      // elementov pod ním; keby tento loop bežal pred pinmi, ScrollTrigger by
      // start/end počítal zo starých (pred-pin) pozícií a sekcie by sa
      // prepínali na nesprávnom mieste scrollu (zistené vizuálnou kontrolou —
      // "product" sekcia nikdy neukázala telefón v očakávanom momente).
      gsap.utils.toArray<HTMLElement>("[data-section]").forEach((el, i) => {
        ScrollTrigger.create({
          trigger: el,
          start: "top 55%",
          end: "bottom 45%",
          onEnter: () => (sceneState.section = i),
          onEnterBack: () => (sceneState.section = i),
        });
      });

      ScrollTrigger.refresh();
    }, rootRef);

    return () => {
      cancelAnimationFrame(rafId);
      ctx.revert();
    };
  }, []);

  return (
    <SmoothScroll>
      <Preloader />
      <Scene3D />
      <div ref={rootRef} className={styles.page}>
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
          {/* ---------- HERO ---------- */}
          <section className={`${styles.hero} v2-hero`} data-section>
            <div className={styles.heroBadge}>
              <RingStat value={14} label="dní zadarmo" size={110} />
            </div>
            <h1 className={`${styles.heroHeadline} v2-hero-headline`}>
              Tvoja trénerská prax,
              <br />
              <span className={styles.accent}>naživo v pohybe.</span>
            </h1>
            <p className={styles.heroSub}>
              FitPilot vedie klientov, plány aj jedálničky pre fitness trénerov na Slovensku a v Česku.
            </p>
            <Link href="/prihlasenie#register" className={`btn btn-primary ${styles.heroCta}`}>
              Začať skúšobné obdobie
              <ArrowIcon />
            </Link>
          </section>

          {/* ---------- ZONES ---------- */}
          <section className={`${styles.section} v2-zones`} data-section>
            <div className="v2-zones-head">
              <p className={styles.eyebrow}>Zóny appky</p>
              <h2 className={styles.sectionHead}>Tri zóny, jeden pracovný tok</h2>
            </div>
            <div className={styles.zoneList}>
              {ZONES.map((z, i) => (
                <div key={z.title} className={styles.zoneRow}>
                  <span className={styles.zoneIndex}>{String(i + 1).padStart(2, "0")}</span>
                  <div className={styles.zoneBody}>
                    <div className={styles.zoneTrack}>
                      <div
                        className={`${styles.zoneFill} ${styles[`zone${z.tone[0].toUpperCase()}${z.tone.slice(1)}`]}`}
                        style={{ transform: "scaleX(0)" }}
                      />
                    </div>
                    <h3>{z.title}</h3>
                    <p>{z.copy}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ---------- PRODUCT (3D telefón v pozadí na desktope) ---------- */}
          <section className={`${styles.section} ${styles.productSection} v2-product`} data-section>
            <p className={styles.eyebrow}>Appka naživo</p>
            <h2 className={`${styles.sectionHead} v2-product-caption`}>Presne to, čo vidí tréner aj klient</h2>
            {/* Statický fallback pre mobile — Scene3D (3D telefón) je tam vypnutá
                (adaptívna stratégia), bez tohto by sekcia bola prázdna. */}
            <img src="/v2/screens/dnes.png" alt="Karta Dnes v klientskom portáli FitPilot" className={styles.productFallbackImg} />
          </section>

          {/* ---------- AI ---------- */}
          <section className={`${styles.section} ${styles.aiSection} v2-reveal`} data-section>
            <p className={styles.eyebrow}>AI blok</p>
            <h2 className={styles.sectionHead}>Kontext, nie generický chatbot</h2>
            <div className={styles.readoutGrid}>
              <div className={styles.readoutTile}>
                <span className={styles.readoutLabel}>Príklad — AI Kouč (klient)</span>
                <p className={styles.readoutQuote}>„Čo mám dnes jesť, ak mi zostáva 400 g bielkovín?“</p>
              </div>
              <div className={styles.readoutTile}>
                <span className={styles.readoutLabel}>Príklad — generátor plánu (tréner)</span>
                <p className={styles.readoutQuote}>„Vygeneruj 4-týždňový silový plán na nabratie svalovej hmoty.“</p>
              </div>
            </div>
            <p className={styles.aiNote}>
              Ilustračné príklady rozhrania — appka nikdy neposiela AI výstup klientovi bez schválenia trénerom.
            </p>
          </section>

          {/* ---------- PRICING ---------- */}
          <section className={`${styles.section} v2-reveal`} data-section>
            <p className={styles.eyebrow}>Cenník</p>
            <h2 className={styles.sectionHead}>Predplatné pre trénera, nie pre klienta</h2>
            <p className={styles.pricingNote}>orientačný cenník pre spustenie — ceny sa môžu do launchu upraviť</p>
            <div className={`${styles.tierGrid} v2-tier-grid`}>
              {TIERS.map((t) => (
                <div key={t.tier} className={`v2-tier-card ${styles.tierCard} ${t.featured ? styles.tierFeatured : ""}`}>
                  <span className={styles.tierName}>{t.tier}</span>
                  <span className={styles.tierMeta}>{t.meta}</span>
                  <span className={styles.tierPrice}>{t.price}</span>
                  <span className={styles.tierPer}>/ mes</span>
                </div>
              ))}
            </div>
          </section>

          {/* ---------- FINAL ---------- */}
          <section className={`${styles.finalCta} v2-reveal`} data-section>
            <RingStat value={100} suffix="%" label="v tvojich rukách" sublabel="AI navrhuje, ty rozhoduješ" size={160} />
            <h2 className={styles.finalHeadline}>Zdvihni administratívu zo svojich pliec.</h2>
            <Link href="/prihlasenie#register" className={`btn btn-primary ${styles.heroCta}`}>
              Začať skúšobné obdobie
              <ArrowIcon />
            </Link>
          </section>
        </main>

        <footer className={styles.footer}>
          <p>
            Interná testovacia varianta landing page (feature/security#2) — bežná stránka ostáva na{" "}
            <Link href="/">fitpilot.sk</Link>.
          </p>
        </footer>
      </div>
    </SmoothScroll>
  );
}
