"use client";

import { useEffect, useState } from "react";
import { LogoMark } from "@/app/components/LogoMark";
import styles from "./portalSplash.module.css";

/* Úvodná obrazovka (splash) po spustení appky z plochy — len v režime `display-mode: standalone`
   (nainštalovaná appka), raz za spustenie (sessionStorage), najviac ~0,9 s, preskočiteľná ťuknutím
   alebo klávesom. Overlay je `position: fixed` → žiadny posun rozloženia. Viditeľnosť rieši
   CSS (media query), takže sa objaví hneď v prvom HTML; inline skript v layoute pri už ukázanom
   splashi nastaví `html[data-fp-splash=done]`, aby pri znovunačítaní v rámci relácie nezablikal.
   Reduced motion: bez animácií (ani zmizne postupne). Pozadie = akcent portálu (značka trénera
   alebo FitPilot), v dlaždici ikona appky trénera alebo logo FitPilot. */

export const SPLASH_FLAG = "fp-splash-shown";
const SHOW_MS = 900;
const FADE_MS = 180;

export function PortalSplash({ name, iconUrl, logoUrl }: { name: string; iconUrl: string | null; logoUrl: string | null }) {
  const [phase, setPhase] = useState<"on" | "leaving" | "gone">("on");

  useEffect(() => {
    const done = () => {
      document.documentElement.dataset.fpSplash = "done";
      setPhase("gone");
    };
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let shown = false;
    try {
      shown = sessionStorage.getItem(SPLASH_FLAG) === "1";
    } catch {
      // úložisko nedostupné (súkromný režim) — splash sa ukáže, no najviac raz za načítanie
    }
    if (!standalone || shown) {
      done();
      return;
    }
    try {
      sessionStorage.setItem(SPLASH_FLAG, "1");
    } catch {
      // ignoruj
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fade = reduce ? 0 : FADE_MS;
    let leaveTimer: ReturnType<typeof setTimeout> | undefined;
    const leave = () => {
      setPhase("leaving");
      leaveTimer = setTimeout(done, fade);
    };
    const showTimer = setTimeout(leave, SHOW_MS - fade);
    const skip = (e: Event) => {
      if (e instanceof KeyboardEvent && !["Escape", "Enter", " "].includes(e.key)) return;
      clearTimeout(showTimer);
      clearTimeout(leaveTimer);
      done();
    };
    window.addEventListener("pointerdown", skip);
    window.addEventListener("keydown", skip);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(leaveTimer);
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
    };
  }, []);

  if (phase === "gone") return null;
  return (
    <div className={`${styles.splash} ${phase === "leaving" ? styles.leaving : ""}`} aria-hidden="true" data-testid="portal-splash">
      <span className={styles.tile}>
        {iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={iconUrl} alt="" className={styles.iconImg} />
        ) : logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className={styles.logoImg} />
        ) : (
          <LogoMark className={styles.logoImg} />
        )}
      </span>
      <span className={styles.name}>{name}</span>
    </div>
  );
}
