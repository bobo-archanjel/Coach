"use client";

// FitPilot — spoločné vykreslenie sprievodcu: zvýraznenie skutočného prvku stránky
// (`data-tour`) + bublina s textom. Používa ho plynulý sprievodca cez sekcie
// (OnboardingTour) aj sprievodcovia hlbších okien (SectionGuide).
//
//  - TourBubble: jeden krok, riadený zvonka (kto je ďalší krok, rozhoduje volajúci).
//    `step = null` = čaká sa (prechod na inú stránku) — obrazovka ostáva stlmená.
//  - TourOverlay: jednoduchý zoznam krokov na jednej stránke. Kroky, ktorých cieľ pri
//    spustení na stránke nie je, sa vynechajú; bez jediného cieľa sa hneď ukončí.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import styles from "./OnboardingTour.module.css";

export interface OverlayStep {
  /** CSS selektor skutočného prvku (atribút data-tour) */
  target: string;
  title: string;
  body: string;
}

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8;
const EDGE = 4;
const TOOLTIP_GAP = 14;
const TOOLTIP_WIDTH = 320;

/** Prvý viditeľný prvok — tá istá kotva môže byť na stránke dvakrát (mobil / počítač), jedna skrytá. */
export function findTourTarget(selector: string): Element | null {
  for (const el of document.querySelectorAll(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

export function TourBubble({
  step,
  dots,
  onBack,
  onNext,
  last,
  onSkip,
}: {
  step: OverlayStep | null;
  /** bodky postupu: počet a ktorá svieti (kroky jednej stránky, alebo sekcie plynulého sprievodcu) */
  dots: { count: number; active: number };
  /** bez `onBack` sa „Späť“ neukáže */
  onBack?: () => void;
  onNext: () => void;
  /** posledný krok — „Dokončiť“ namiesto „Ďalej“ */
  last: boolean;
  onSkip: () => void;
}) {
  const t = useTranslations("tour");
  const [rect, setRect] = useState<Rect | null>(null);
  const [tipHeight, setTipHeight] = useState(190);
  const tipRef = useRef<HTMLDivElement>(null);
  const target = step?.target ?? null;

  const measure = useCallback(() => {
    if (!target) return;
    const el = findTourTarget(target);
    if (!el) return; // cieľ na chvíľu zmizol (prekreslenie) — ostáva posledná známa poloha
    const r = el.getBoundingClientRect();
    // orezané na obrazovku — rámik je vidieť aj pri cieli vyššom / širšom než okno
    const top = Math.max(r.top - PAD, EDGE);
    const left = Math.max(r.left - PAD, EDGE);
    const bottom = Math.min(r.bottom + PAD, window.innerHeight - EDGE);
    const right = Math.min(r.right + PAD, window.innerWidth - EDGE);
    setRect({ top, left, width: Math.max(right - left, 0), height: Math.max(bottom - top, 0) });
  }, [target]);

  // Nový krok: cieľ do stredu obrazovky (vysoký cieľ od začiatku), potom meranie. Posun a
  // zmena veľkosti okna len premerajú — nikdy znova neposúvajú stránku.
  useEffect(() => {
    if (!target) return;
    const el = findTourTarget(target);
    if (el) {
      const tall = el.getBoundingClientRect().height > window.innerHeight * 0.6;
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: tall ? "start" : "center", inline: "nearest", behavior: calm ? "auto" : "smooth" });
    }
    // krátke oneskorenie, nech sa meria po ustálení rozloženia (lišta dole na mobile)
    const timer = window.setTimeout(measure, 80);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [target, measure]);

  // výška bubliny podľa textu kroku; `rect` v závislostiach — bublina sa vykreslí až po zmeraní cieľa
  useLayoutEffect(() => {
    const h = tipRef.current?.offsetHeight;
    if (h && h !== tipHeight) setTipHeight(h);
  }, [step, rect, tipHeight]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSkip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSkip]);

  // čakanie na ďalšiu stránku: len stlmená obrazovka (kliky nikam neprepadnú)
  if (!step || !rect) {
    return <div className={`${styles.overlay} ${styles.veil}`} data-tour-overlay="" aria-hidden="true" />;
  }

  // Bublina pod cieľom, ak je miesto, inak nad ním. Cieľ cez celú výšku okna (dlhý zoznam):
  // zvýrazní sa len jeho horná časť a bublina je pod ňou — nikdy cieľ neprekrýva.
  // Vodorovne od ľavého okraja cieľa, vždy celá v okne.
  const width = Math.min(TOOLTIP_WIDTH, window.innerWidth - 32);
  const need = tipHeight + TOOLTIP_GAP + 8;
  const below = window.innerHeight - (rect.top + rect.height);
  const left = Math.min(Math.max(rect.left, 16), window.innerWidth - width - 16);
  let spot = rect;
  let tooltipStyle: React.CSSProperties;
  if (below >= need) tooltipStyle = { top: rect.top + rect.height + TOOLTIP_GAP, left };
  else if (rect.top >= need) tooltipStyle = { bottom: window.innerHeight - rect.top + TOOLTIP_GAP, left };
  else {
    const height = Math.max(window.innerHeight - rect.top - need, 96);
    spot = { ...rect, height };
    tooltipStyle = { top: rect.top + height + TOOLTIP_GAP, left };
  }

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={t("label", { title: step.title })}
      data-tour-overlay=""
    >
      <div className={styles.spotlight} style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }} />
      <div ref={tipRef} className={styles.tooltip} style={tooltipStyle}>
        {dots.count > 1 && (
          <div className={styles.dots} aria-hidden="true">
            {Array.from({ length: dots.count }, (_, i) => (
              <span key={i} className={`${styles.dot} ${i === dots.active ? styles.dotActive : ""}`} />
            ))}
          </div>
        )}
        <h3 className={styles.title}>{step.title}</h3>
        <p className={styles.body}>{step.body}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.skipBtn} onClick={onSkip}>
            {t("skip")}
          </button>
          <div className={styles.actionsRight}>
            {onBack && (
              <button type="button" className={styles.backBtn} onClick={onBack}>
                {t("back")}
              </button>
            )}
            <button type="button" className={styles.nextBtn} onClick={onNext}>
              {last ? t("finish") : t("next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TourOverlay({ steps, onFinish }: { steps: OverlayStep[]; onFinish: () => void }) {
  // kroky s viditeľným cieľom v čase spustenia (komponent sa pripája až na klientovi)
  const [list] = useState(() => steps.filter((s) => findTourTarget(s.target)));
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (list.length === 0) onFinish();
  }, [list, onFinish]);

  if (list.length === 0) return null;
  const last = index === list.length - 1;
  return (
    <TourBubble
      step={list[index]}
      dots={{ count: list.length, active: index }}
      onBack={index > 0 ? () => setIndex((i) => i - 1) : undefined}
      onNext={() => (last ? onFinish() : setIndex((i) => i + 1))}
      last={last}
      onSkip={onFinish}
    />
  );
}
