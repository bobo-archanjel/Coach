"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import styles from "../page.module.css";

gsap.registerPlugin(DrawSVGPlugin);

// Dve doplnkové 2D/SVG widgety do voľného priestoru vpravo od HeroShowcase
// screenshotov (vyžiadané — priestor tam pôsobil prázdno). Zámerne 2D/GSAP,
// nie 3D model — tri predošlé 3D centerpiece pokusy (atlét/barbell/kettlebell)
// vo vizuálnej kontrole nesedeli. Vlastný vyšší breakpoint (1400px) — tieto
// widgety dopĺňajú už schválený HeroShowcase, nemajú mu konkurovať v menšom
// priestore, kde sotva sedia karty samotné.
const EKG_PATH = "M0 20 L34 20 L42 4 L50 34 L58 12 L66 20 L200 20";

export function HeroExtras() {
  const ekgPathRef = useRef<SVGPathElement>(null);
  const dumbbellRef = useRef<HTMLDivElement>(null);
  const repNumRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = window.matchMedia("(max-width: 1400px)").matches;
    if (mobile || reduced) return;

    const ctx = gsap.context(() => {
      // EKG krivka sa v slučke dokresľuje (DrawSVGPlugin) — rovnaký motív
      // ako pozadie (ShaderBackdrop), tu ako "živý" prístrojový readout.
      if (ekgPathRef.current) {
        gsap.fromTo(
          ekgPathRef.current,
          { drawSVG: "0%" },
          { drawSVG: "100%", duration: 1.6, ease: "power1.inOut", repeat: -1, repeatDelay: 0.3 },
        );
      }

      // Rep counter — plochá 2D ikona činky sa hojdá hore-dole, číslo tiká
      // v rytme 1→12→1, oboje v jednej timeline nech sú presne sfázované.
      if (dumbbellRef.current && repNumRef.current) {
        const counter = { val: 1 };
        const numEl = repNumRef.current;
        const tl = gsap.timeline({ repeat: -1 });
        for (let rep = 1; rep <= 12; rep++) {
          tl.to(dumbbellRef.current, { y: -7, duration: 0.32, ease: "power2.out" })
            .to(counter, { val: rep, duration: 0.01, onUpdate: () => (numEl.textContent = String(Math.round(counter.val))) }, "<")
            .to(dumbbellRef.current, { y: 0, duration: 0.32, ease: "power2.in" });
        }
        tl.to({}, { duration: 0.8 }); // pauza pred ďalším "sériou"
      }
    });

    return () => ctx.revert();
  }, []);

  return (
    <div className={styles.heroExtras} aria-hidden="true">
      <div className={`${styles.extraCard} ${styles.vitalsCard}`}>
        <div className={styles.vitalsHead}>
          <span className={styles.vitalsDot} />
          <span>VITALS · LIVE</span>
        </div>
        <svg viewBox="0 0 200 40" className={styles.ekgSvg} preserveAspectRatio="none">
          <path ref={ekgPathRef} d={EKG_PATH} fill="none" stroke="var(--iron-red)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className={styles.vitalsBpm}>128 <small>bpm</small></span>
      </div>

      <div className={`${styles.extraCard} ${styles.repCard}`}>
        <span className={styles.repLabel}>DNEŠNÝ SET</span>
        <div ref={dumbbellRef} className={styles.dumbbellIcon}>
          <svg viewBox="0 0 64 24" width="52" height="20">
            <rect x="0" y="6" width="10" height="12" rx="3" fill="var(--iron-red)" />
            <rect x="6" y="2" width="4" height="20" rx="1.5" fill="var(--iron-red)" />
            <rect x="22" y="10" width="20" height="4" rx="2" fill="var(--steel)" />
            <rect x="54" y="2" width="4" height="20" rx="1.5" fill="var(--iron-red)" />
            <rect x="54" y="6" width="10" height="12" rx="3" fill="var(--iron-red)" />
          </svg>
        </div>
        <span className={styles.repNum}>
          <span ref={repNumRef}>1</span>
          <small> reps</small>
        </span>
      </div>
    </div>
  );
}
