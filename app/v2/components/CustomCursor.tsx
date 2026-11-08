"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import styles from "../page.module.css";

/**
 * HUD crosshair kurzor — bodka + prstenec, ktorý sa pri prejazde nad
 * interaktívnym prvkom (`data-cursor`) zväčší a ukáže krátky label namiesto
 * generickej šípky. Desktop-only mouse efekt ("rok 3500" HUD jazyk); na
 * touch zariadeniach a pri `prefers-reduced-motion` sa vôbec nemountuje a
 * appka necháva natívny kurzor (magnetizmus/hover-label nemá pri dotyku
 * zmysel a `pointermove` tam nepríde v užitočnej podobe).
 */
export function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (reduced || touch) return;
    setEnabled(true);

    const dotX = gsap.quickTo(dotRef.current, "x", { duration: 0.12, ease: "power3.out" });
    const dotY = gsap.quickTo(dotRef.current, "y", { duration: 0.12, ease: "power3.out" });
    const ringX = gsap.quickTo(ringRef.current, "x", { duration: 0.35, ease: "power3.out" });
    const ringY = gsap.quickTo(ringRef.current, "y", { duration: 0.35, ease: "power3.out" });

    const onMove = (e: PointerEvent) => {
      setSeen(true);
      dotX(e.clientX);
      dotY(e.clientY);
      ringX(e.clientX);
      ringY(e.clientY);
      const target = (e.target as HTMLElement)?.closest?.("[data-cursor]") as HTMLElement | null;
      setActive(Boolean(target));
      setLabel(target?.getAttribute("data-cursor") || null);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useEffect(() => {
    if (!ringRef.current) return;
    gsap.to(ringRef.current, { scale: active ? 1.8 : 1, duration: 0.25, ease: "power2.out" });
  }, [active]);

  if (!enabled) return null;

  return (
    <div className={`${styles.cursorLayer} ${seen ? styles.cursorLayerVisible : ""}`} aria-hidden="true">
      <div ref={dotRef} className={styles.cursorDot} />
      <div ref={ringRef} className={`${styles.cursorRing} ${active ? styles.cursorRingActive : ""}`}>
        {label && <span className={styles.cursorLabel}>{label}</span>}
      </div>
    </div>
  );
}
