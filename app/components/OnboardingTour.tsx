"use client";

// FitPilot — feature/navod: interaktívny spotlight tour cez skutočné UI prvky
// (nie mockup screenshoty). Ukazuje na reálne `data-tour` atribúty v
// DashboardNav.tsx / PortalNav.tsx, funguje teda rovnako na sidebari (>880px)
// aj na bottom nav bare (mobile) bez akéhokoľvek špeciálneho vetvenia — pozícia
// sa vždy počíta z aktuálneho `getBoundingClientRect()` cieľa.
//
// Automatické spustenie: layout (dashboard/portal) odovzdá `tourSeen` z
// lib/onboarding/actions.ts (profiles.tour_completed_at). Manuálne znova
// spustenie: odkaz s `?tour=1` na domovskej trase danej role (pozri
// Nastavenia / Profil) — číta sa cez useSearchParams a po zavretí sa parameter
// z URL odstráni (router.replace), nech sa pri refreshi znova nespustí.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { completeTourAction } from "@/lib/onboarding/actions";
import type { TourStep } from "@/lib/onboarding/tourSteps";
import styles from "./OnboardingTour.module.css";

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8;
const TOOLTIP_GAP = 14;
const TOOLTIP_WIDTH = 320;

export function OnboardingTour({ steps, tourSeen }: { steps: TourStep[]; tourSeen: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const forceReplay = searchParams.get("tour") === "1";

  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // `OnboardingTour` je súčasť TRVALÉHO layoutu (dashboard/portal) — pri bežnej
  // navigácii v appke sa nemountuje znova, takže "len raz pri mounte" by
  // "Spustiť návod znova" (klik z inej stránky na `?tour=1`, klientská
  // navigácia bez remountu) nikdy nezachytilo. Závislosť na `forceReplay`
  // (nie na celom `searchParams` objekte, ktorý mení identitu pri KAŽDEJ zmene
  // query stringu) reaguje presne na prechod false→true. `finish()` nižšie
  // vždy odstráni `tour` z URL, takže sa tu nikdy nezacyklí.
  useEffect(() => {
    if (forceReplay || !tourSeen) {
      setActive(true);
      setStepIndex(0);
    }
    // Automatické spustenie (prvé prihlásenie) sa hneď zapíše ako „videné“ — aj keď
    // používateľ sprievodcu nedokončí (zavrie kartu, odhlási sa), pri ďalšom prihlásení
    // sa už nespustí. Manuálne „Spustiť návod znova“ (?tour=1) nič nezapisuje vopred.
    if (!forceReplay && !tourSeen) void completeTourAction();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceReplay]);

  const measure = useCallback(() => {
    if (!active) return;
    const step = steps[stepIndex];
    if (!step) return;
    // Prvý viditeľný prvok — tá istá kotva môže byť dvakrát (ikona klienta v hlavičke na
    // mobile aj dole v bočnom paneli na počítači), jeden z nich je skrytý (display: none).
    const el = Array.from(document.querySelectorAll(step.target)).find((n) => {
      const r = n.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const r = el.getBoundingClientRect();
    setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
  }, [active, stepIndex, steps]);

  useEffect(() => {
    if (!active) return;
    // Krátky delay po scrollIntoView, nech je rect meraný po ustálení layoutu
    // (najmä na mobile bottom nav, kde scroll môže ešte prebiehať).
    const t = setTimeout(measure, 80);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, measure]);

  const finish = useCallback(async () => {
    // Cookie (zdroj pravdy pre layout na ĎALŠEJ navigácii) sa zapisuje touto
    // akciou — ak by sme skryli dialóg (setActive(false)) skôr, než sa stihne
    // zapísať, rýchla navigácia hneď po "Preskočiť"/"Dokončiť" by mohla predbehnúť
    // zápis cookie a tour by sa na ďalšej stránke spustil znova od kroku 0
    // (nájdené pri reálnom e2e teste: skip na /dashboard, klik na "Správy" hneď
    // potom ukázal tour nanovo na "Klienti").
    await completeTourAction();
    setActive(false);
    if (forceReplay) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("tour");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }
  }, [forceReplay, pathname, router, searchParams]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finish]);

  if (!active) return null;

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  // Tooltip pod cieľom, ak je dosť miesta, inak nad ním; horizontálne zarovnaný
  // na ľavý okraj cieľa a orezaný, nech nepretečie cez okraj obrazovky.
  let tooltipStyle: React.CSSProperties = { opacity: 0 };
  if (rect) {
    const spaceBelow = window.innerHeight - (rect.top + rect.height);
    const placeBelow = spaceBelow > 180 || rect.top < 180;
    const top = placeBelow ? rect.top + rect.height + TOOLTIP_GAP : undefined;
    const bottom = !placeBelow ? window.innerHeight - rect.top + TOOLTIP_GAP : undefined;
    const left = Math.min(Math.max(rect.left, 16), window.innerWidth - TOOLTIP_WIDTH - 16);
    tooltipStyle = { top, bottom, left, opacity: 1 };
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={`Návod: ${step.title}`}>
      {rect && (
        <div
          className={styles.spotlight}
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
      )}
      <div ref={containerRef} className={styles.tooltip} style={tooltipStyle}>
        <div className={styles.dots} aria-hidden="true">
          {steps.map((_, i) => (
            <span key={i} className={`${styles.dot} ${i === stepIndex ? styles.dotActive : ""}`} />
          ))}
        </div>
        <h3 className={styles.title}>{step.title}</h3>
        <p className={styles.body}>{step.body}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.skipBtn} onClick={() => void finish()}>
            Preskočiť
          </button>
          <div className={styles.actionsRight}>
            {stepIndex > 0 && (
              <button type="button" className={styles.backBtn} onClick={() => setStepIndex((i) => i - 1)}>
                Späť
              </button>
            )}
            <button
              type="button"
              className={styles.nextBtn}
              onClick={() => (isLast ? void finish() : setStepIndex((i) => i + 1))}
            >
              {isLast ? "Dokončiť" : "Ďalej"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
