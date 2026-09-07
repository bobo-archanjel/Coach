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
import { MagneticButton } from "./components/MagneticButton";
import { FeatureCard } from "./components/FeatureCard";
import { sceneState } from "./lib/sceneState";
import styles from "./page.module.css";

/*
 * IMPECCABLE DIRECTION CONTRACT — feature/security#2, /v2 landing variant, rebuild #2
 *
 * THESIS: the first build read as "reveal-on-scroll pasted onto a static
 * page." This rebuild commits every section to a technique that actually
 * needs the scrollbar as an input device — pin, scrub, horizontal hijack,
 * parallax, magnetism — so the page behaves like a motion studio's demo
 * reel, not a brochure with fade-ins.
 * OWN-WORLD: unchanged FitPilot palette (grafitový ink/paper/iron-red/plate-
 * yellow/moss) and Inter — no new brand color, no new font. The mocap
 * athlete (coral wireframe) and particle field carry the "motion graphics"
 * half of the brief; GSAP/Lenis/ScrollTrigger choreography carries the rest.
 * A synthetic 3D phone was cut from the previous build — the app now proves
 * itself with its own real screenshots inside the DOM (feature grid, "ako to
 * funguje" gallery), which reads as more honest than a second 3D prop
 * fighting the athlete for attention.
 * STORY: a trainer scrolls through their own coaching practice — clients,
 * builder, nutrition, AI, price, decision — each screen a live mechanism,
 * not a static card, and lands on a CTA that feels inevitable, not tacked on.
 * FIRST VIEWPORT: pinned hero, parallax coral/amber glow shapes behind a
 * SplitText char-reveal headline that autoplays the instant the preloader
 * clears (never scrub-gated — a scrub-only reveal leaves scroll position 0
 * blank, a real regression caught by screenshot review in the first build).
 * FORM: GSAP + ScrollTrigger + SplitText for every choreography primitive
 * (pin, scrub, stagger, horizontal drag-track, clip-path typing), Lenis for
 * inertia, React Three Fiber/drei for the mocap athlete + particle layer.
 * Pricing is deliberately the calmest section on the page — a simple fade,
 * no pin, no scrub — because a buyer must be able to read it without
 * fighting the scrollbar.
 * FINISH: reduced-motion strips every pin/scrub/parallax/horizontal-hijack
 * down to a plain opacity+8px fade (3D layer already gone at that media
 * query); mobile (<768px) turns the pinned horizontal gallery into a native
 * scroll-snap row instead of hijacking vertical scroll for horizontal intent.
 * Verified via tsc/build/e2e plus desktop+mobile screenshot inspection.
 */

gsap.registerPlugin(ScrollTrigger, SplitText);

const ArrowIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
    <path d="M3 7.5h9M8 3l4.5 4.5L8 12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const FEATURES: { title: string; copy: string; tags: string[]; tone: "coral" | "amber" | "moss" | "steel" }[] = [
  {
    title: "Správa klientov",
    copy: "Databáza s kontaktmi, cieľmi a zdravotnými obmedzeniami. Onboarding formulár aj história merania na jednom mieste.",
    tags: ["Onboarding formulár", "História merania", "Tagy klientov"],
    tone: "coral",
  },
  {
    title: "Tréningový builder",
    copy: "Knižnica cvikov s videom aj technikou. Série, opakovania, záťaž, tempo, pauzy — a progresívne preťaženie navrhnuté z histórie.",
    tags: ["Knižnica cvikov", "Mezocykly", "Progresívne preťaženie"],
    tone: "coral",
  },
  {
    title: "Výživa a makrá",
    copy: "Automatický výpočet BMR/TDEE navrhne makrá podľa cieľa. Klient loguje stravu, vidí plnenie makier deň za dňom.",
    tags: ["BMR/TDEE", "Food diary", "Grafy plnenia"],
    tone: "amber",
  },
  {
    title: "Komunikácia",
    copy: "Chat medzi trénerom a klientom priamo v appke, pripomienky tréningu a spätná väzba — RPE, pocit, poznámka.",
    tags: ["Chat", "Notifikácie", "RPE feedback"],
    tone: "steel",
  },
  {
    title: "Progres tracking",
    copy: "Grafy vývoja váhy, odhadovaného 1RM a obvodov. Foto porovnanie pred/po a automatické reporty bez ručného písania.",
    tags: ["Grafy sily", "Foto porovnanie", "Automatické reporty"],
    tone: "coral",
  },
  {
    title: "Biznis vrstva",
    copy: "Kalendár rezervácií, fakturácia cez Stripe, balíčky služieb a multi-klient dashboard na jeden pohľad.",
    tags: ["Kalendár", "Stripe fakturácia", "Multi-klient dashboard"],
    tone: "amber",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Pozvi klienta",
    copy: "Vygeneruješ jednorazový invite kód, klient sa napojí cez appku za pár sekúnd.",
    shot: "/v2/screens/dnes.png",
  },
  {
    step: "02",
    title: "Priprav plán",
    copy: "Tréning aj výživa v jednom builderi — AI navrhne prvý draft, ty ho doladíš.",
    shot: "/v2/screens/dennik.png",
  },
  {
    step: "03",
    title: "Klient loguje",
    copy: "Denník, fotky, RPE spätná väzba — priamo z telefónu, bez exceloviek.",
    shot: "/v2/screens/chat.png",
  },
  {
    step: "04",
    title: "Sleduj a uprav",
    copy: "Grafy a AI upozornenia na odchýlku — posledné slovo má vždy tréner.",
    shot: "/v2/screens/dnes.png",
  },
];

const CHAT: { who: "client" | "ai"; name: string; text: string }[] = [
  { who: "client", name: "Peter · klient", text: "Čo mám dnes jesť, ak mi zostáva 400 g bielkovín?" },
  { who: "ai", name: "AI kouč", text: "Skús 250 g kuracích pŕs a proteínový shake — doplní zvyšok do večera." },
  { who: "client", name: "Lucia · klientka", text: "Bolí ma rameno pri tlaku nad hlavu, čo mám robiť?" },
  { who: "ai", name: "AI kouč", text: "Dnes vynechaj tlaky nad hlavu — navrhnem náhradné cviky trénerovi na schválenie." },
];

const TIERS = [
  { tier: "Starter", meta: "do 10 klientov", price: "15–20 €" },
  { tier: "Pro", meta: "do 50 klientov", price: "40–50 €", featured: true },
  { tier: "Business", meta: "neobmedzene", price: "80–100 €" },
];

export function V2Experience() {
  const rootRef = useRef<HTMLDivElement>(null);
  const howScrollerRef = useRef<HTMLDivElement>(null);
  const howTrackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId: number;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobile = window.matchMedia("(max-width: 768px)").matches;

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

      // ---------- HERO: char-split headline, autoplay po preloaderi, pin ----------
      // "words, chars" (not "chars" alone) — chars-only splitting lets the
      // browser line-break mid-word between the individual char spans (real
      // bug, caught by screenshot review: "trénerská" wrapped as "trén" /
      // "erská"); wrapping each word first keeps line breaks at real word
      // boundaries while chars stay individually animatable.
      const heroSplit = new SplitText(".v2-hero-headline", { type: "words, chars" });
      gsap.set(heroSplit.chars, { yPercent: 120, opacity: 0 });
      const heroTl = gsap.timeline({ paused: true });
      heroTl
        .to(heroSplit.chars, { yPercent: 0, opacity: 1, stagger: 0.02, ease: "power3.out" })
        .to(`.${styles.heroSub}, .${styles.heroCta}`, { opacity: 1, y: 0, stagger: 0.08 }, "-=0.2")
        .to(`.${styles.heroBadge}`, { opacity: 1, scale: 1 }, "<");

      if (!reduced) {
        ScrollTrigger.create({ trigger: ".v2-hero", start: "top top", end: "+=60%", pin: true });
        // Parallax: dva glow tvary v hero sa hýbu opačným smerom a rôznou
        // rýchlosťou (klasický multi-layer parallax), scrub priamo na scrollTop.
        gsap.to(`.${styles.heroShape1}`, {
          yPercent: -35,
          ease: "none",
          scrollTrigger: { trigger: ".v2-hero", start: "top top", end: "bottom top", scrub: 0.6 },
        });
        gsap.to(`.${styles.heroShape2}`, {
          yPercent: 45,
          ease: "none",
          scrollTrigger: { trigger: ".v2-hero", start: "top top", end: "bottom top", scrub: 0.6 },
        });
      }

      // rAF polling namiesto custom eventu — nezávisí od poradia mountu
      // Preloader vs. tento efekt (Preloader nastaví sceneState.ready).
      const waitForReady = () => {
        if (sceneState.ready) {
          heroTl.play();
          return;
        }
        rafId = requestAnimationFrame(waitForReady);
      };
      waitForReady();

      // ---------- FEATURES: scroll-trigger staggered reveal grid ----------
      gsap.from(".v2-feature-head", {
        opacity: 0,
        y: 24,
        duration: 0.7,
        ease: "power2.out",
        scrollTrigger: { trigger: ".v2-features", start: "top 80%" },
      });
      gsap.from(".v2-feature-card", {
        opacity: 0,
        y: 40,
        scale: 0.94,
        duration: 0.6,
        stagger: 0.1,
        ease: "power2.out",
        scrollTrigger: { trigger: ".v2-feature-grid", start: "top 78%" },
      });

      // ---------- HOW: pinned horizontálna galéria (desktop/tablet) ----------
      if (!reduced && !isMobile && howTrackRef.current && howScrollerRef.current) {
        const track = howTrackRef.current;
        // Natívny horizontálny scroll (CSS fallback pre reduced-motion/mobile,
        // viď .howScroller) sa tu vypína — pin + scrub berie kontrolu nad
        // horizontálnou pozíciou cez transform, dva súbežné mechanizmy by sa
        // bili o tú istú os.
        howScrollerRef.current.style.overflow = "hidden";
        const getDistance = () => Math.max(0, track.scrollWidth - track.parentElement!.clientWidth);
        const howTl = gsap.timeline({
          scrollTrigger: {
            trigger: ".v2-how",
            start: "top top",
            end: () => `+=${getDistance()}`,
            pin: true,
            scrub: 0.7,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              gsap.set(`.${styles.howProgressFill}`, { scaleX: self.progress });
            },
          },
        });
        howTl.to(track, { x: () => -getDistance(), ease: "none" });
      } else {
        // Mobile / reduced-motion: natívny scroll (CSS), len jemný fade-in kariet.
        gsap.from(".v2-how-card", {
          opacity: 0,
          y: 24,
          duration: 0.6,
          stagger: 0.1,
          ease: "power2.out",
          scrollTrigger: { trigger: ".v2-how", start: "top 85%" },
        });
      }

      // ---------- AI: pinned + scrub-driven "typing" chat bubliny ----------
      const bubbles = gsap.utils.toArray<HTMLElement>(".v2-chat-bubble");
      gsap.set(bubbles, { opacity: 0, y: 16 });
      gsap.set(`.${styles.chatText}`, { clipPath: "inset(0 100% 0 0)" });

      if (!reduced) {
        const chatTl = gsap.timeline({
          scrollTrigger: { trigger: ".v2-ai", start: "top top", end: "+=160%", pin: true, scrub: 0.6 },
        });
        bubbles.forEach((bubble, i) => {
          const text = bubble.querySelector(`.${styles.chatText}`);
          chatTl.to(bubble, { opacity: 1, y: 0, duration: 0.4 }, i).to(text, { clipPath: "inset(0 0% 0 0)", duration: 0.7 }, i + 0.1);
        });
      } else {
        gsap.to(bubbles, {
          opacity: 1,
          y: 0,
          duration: 0.5,
          stagger: 0.15,
          scrollTrigger: { trigger: ".v2-ai", start: "top 75%" },
        });
        gsap.set(`.${styles.chatText}`, { clipPath: "inset(0 0% 0 0)" });
      }

      // ---------- PRICING: jemný fade, žiadny pin/scrub (musí ostať čitateľné) ----------
      gsap.from(".v2-pricing-head", {
        opacity: 0,
        y: 20,
        duration: 0.6,
        scrollTrigger: { trigger: ".v2-pricing", start: "top 82%" },
      });
      gsap.from(".v2-tier-card", {
        opacity: 0,
        y: 24,
        duration: 0.55,
        stagger: 0.1,
        ease: "power2.out",
        scrollTrigger: { trigger: ".v2-tier-grid", start: "top 84%" },
      });

      // ---------- FINAL: split headline + parallax shapes + reveal ----------
      const finalSplit = new SplitText(".v2-final-headline", { type: "words, chars" });
      gsap.set(finalSplit.chars, { yPercent: 100, opacity: 0 });
      gsap.to(finalSplit.chars, {
        yPercent: 0,
        opacity: 1,
        stagger: 0.015,
        ease: "power3.out",
        scrollTrigger: { trigger: ".v2-final", start: "top 70%" },
      });
      gsap.from(".v2-final-content > *:not(.v2-final-headline)", {
        opacity: 0,
        y: 26,
        stagger: 0.1,
        duration: 0.6,
        scrollTrigger: { trigger: ".v2-final", start: "top 70%" },
      });
      if (!reduced) {
        gsap.to(`.${styles.finalShape1}`, {
          yPercent: -30,
          ease: "none",
          scrollTrigger: { trigger: ".v2-final", start: "top bottom", end: "bottom top", scrub: 0.6 },
        });
        gsap.to(`.${styles.finalShape2}`, {
          yPercent: 40,
          ease: "none",
          scrollTrigger: { trigger: ".v2-final", start: "top bottom", end: "bottom top", scrub: 0.6 },
        });
      }

      // ---------- ktorá sekcia je aktívna (pre 3D scénu) — AŽ PO všetkých pinoch ----------
      // Pin vkladá pin-spacer a mení layout pod sebou; keby tento loop bežal
      // pred pinmi vyššie, ScrollTrigger by start/end počítal zo starých
      // (pred-pin) pozícií (zistené vizuálnou kontrolou v prvom rebuilde).
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
            <div className={styles.heroShape1} aria-hidden="true" />
            <div className={styles.heroShape2} aria-hidden="true" />
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
            <MagneticButton href="/prihlasenie#register" className={`btn btn-primary ${styles.heroCta}`}>
              Začať skúšobné obdobie
              <ArrowIcon />
            </MagneticButton>
          </section>

          {/* ---------- FEATURES ---------- */}
          <section className={`${styles.section} v2-features`} data-section>
            <div className="v2-feature-head">
              <p className={styles.eyebrow}>Čo appka robí</p>
              <h2 className={styles.sectionHead}>Šesť nástrojov, jeden pracovný tok</h2>
            </div>
            <div className={`${styles.featureGrid} v2-feature-grid`}>
              {FEATURES.map((f, i) => (
                <FeatureCard key={f.title} index={i} title={f.title} copy={f.copy} tags={f.tags} tone={f.tone} />
              ))}
            </div>
          </section>

          {/* ---------- HOW: pinned horizontálna galéria ---------- */}
          <section className={`${styles.section} ${styles.howSection} v2-how`} data-section>
            <div className={styles.howViewport}>
              <div className={styles.howHead}>
                <p className={styles.eyebrow}>Ako to funguje</p>
                <h2 className={styles.sectionHead}>Od pozvánky po prvý report</h2>
              </div>
              <div ref={howScrollerRef} className={styles.howScroller}>
                <div ref={howTrackRef} className={styles.howTrack}>
                  {STEPS.map((s) => (
                    <div key={s.step} className={`v2-how-card ${styles.howCard}`}>
                      <span className={styles.howStep}>Krok {s.step}</span>
                      <h3>{s.title}</h3>
                      <p>{s.copy}</p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.shot} alt={`Náhľad — ${s.title.toLowerCase()}`} className={styles.howShot} />
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles.howProgress}>
                <div className={styles.howProgressFill} />
              </div>
            </div>
          </section>

          {/* ---------- AI: pinned scrub-driven chat ---------- */}
          <section className={`${styles.aiViewport} v2-ai`} data-section>
            <div className={styles.aiInner}>
              <p className={styles.eyebrow}>AI s dohľadom trénera</p>
              <h2 className={styles.sectionHead}>Kontext, nie generický chatbot</h2>
              <div className={styles.chatList}>
                {CHAT.map((m, i) => (
                  <div
                    key={i}
                    className={`v2-chat-bubble ${styles.chatBubble} ${m.who === "client" ? styles.chatClient : styles.chatAi}`}
                  >
                    <span className={styles.chatTag}>{m.name}</span>
                    <span className={styles.chatText}>{m.text}</span>
                  </div>
                ))}
              </div>
              <p className={styles.aiNote}>
                Ilustračné príklady rozhrania — appka nikdy neposiela AI výstup klientovi bez schválenia trénerom.
              </p>
            </div>
          </section>

          {/* ---------- PRICING ---------- */}
          <section className={`${styles.section} v2-pricing`} data-section>
            <div className="v2-pricing-head">
              <p className={styles.eyebrow}>Cenník</p>
              <h2 className={styles.sectionHead}>Predplatné pre trénera, nie pre klienta</h2>
            </div>
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
          <section className={`${styles.finalCta} v2-final`} data-section>
            <div className={styles.finalShape1} aria-hidden="true" />
            <div className={styles.finalShape2} aria-hidden="true" />
            <div className={`v2-final-content ${styles.finalContent}`}>
              <RingStat value={100} suffix="%" label="v tvojich rukách" sublabel="AI navrhuje, ty rozhoduješ" size={160} />
              <h2 className={`${styles.finalHeadline} v2-final-headline`}>Zdvihni administratívu zo svojich pliec.</h2>
              <MagneticButton href="/prihlasenie#register" className={`btn btn-primary ${styles.heroCta}`}>
                Začať skúšobné obdobie
                <ArrowIcon />
              </MagneticButton>
            </div>
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
