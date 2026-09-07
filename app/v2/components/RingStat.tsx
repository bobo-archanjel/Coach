"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import styles from "../page.module.css";

gsap.registerPlugin(ScrollTrigger);

/**
 * Prstenec + počítajúce sa číslo — GSAP namiesto `motion` (jeden systém
 * choreografie na celej stránke, viď direction contract v page.tsx).
 * Rovnaká geometria ako prstenec postupu v /portal (DESIGN.md).
 */
export function RingStat({
  value,
  suffix = "",
  label,
  sublabel,
  size = 220,
}: {
  value: number;
  suffix?: string;
  label: string;
  sublabel?: string;
  size?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const circleRef = useRef<SVGCircleElement>(null);
  const numRef = useRef<HTMLSpanElement>(null);
  const radius = 92;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    if (!wrapRef.current || !circleRef.current || !numRef.current) return;
    const counter = { val: 0 };
    const ctx = gsap.context(() => {
      gsap.set(circleRef.current, { strokeDashoffset: circumference });
      ScrollTrigger.create({
        trigger: wrapRef.current,
        start: "top 85%",
        once: true,
        onEnter: () => {
          gsap.to(circleRef.current, { strokeDashoffset: 0, duration: 1.4, ease: "power3.out" });
          gsap.to(counter, {
            val: value,
            duration: 1.4,
            ease: "power3.out",
            onUpdate: () => {
              if (numRef.current) numRef.current.textContent = `${Math.round(counter.val)}${suffix}`;
            },
          });
        },
      });
    }, wrapRef);
    return () => ctx.revert();
  }, [value, suffix, circumference]);

  const scale = size / 220;
  const showSublabel = Boolean(sublabel) && size >= 200;

  return (
    <div ref={wrapRef} className={styles.ringWrap} style={{ width: size, height: size }}>
      <svg viewBox="0 0 220 220" className={styles.ringSvg}>
        <circle cx="110" cy="110" r={radius} fill="none" stroke="rgba(224,64,42,0.16)" strokeWidth="16" />
        <circle
          ref={circleRef}
          cx="110"
          cy="110"
          r={radius}
          fill="none"
          stroke="var(--iron-red)"
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={circumference}
          transform="rotate(-90 110 110)"
        />
      </svg>
      <div className={styles.ringCenter} style={{ "--ring-scale": scale } as React.CSSProperties}>
        <span ref={numRef} className={styles.ringNum}>
          0{suffix}
        </span>
        <span className={styles.ringLabel}>{label}</span>
        {showSublabel && <span className={styles.ringSublabel}>{sublabel}</span>}
      </div>
    </div>
  );
}
