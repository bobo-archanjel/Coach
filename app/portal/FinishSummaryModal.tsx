"use client";

import { useEffect, useRef, useState } from "react";
import type { CelebrationId } from "@/lib/gamification/rewards";
import { CelebrationBurst } from "./CelebrationBurst";
import { clearFinishSummaryAction } from "./gamificationActions";
import { useOverlayActive } from "./overlayGate";
import g from "../components/gamification.module.css";
import g2 from "../components/gamificationV2.module.css";

/* „Tréning v číslach“ po ukončení tréningu: čas (ak je k dispozícii), objem, série, rekordy, XP s animovaným
   počítadlom, pokrok misií, séria a tlačidlo na zdieľanie. Všetky čísla prišli zo servera (cookie z
   finishWorkoutAction → FinishSummaryHost); texty sú hotové. Počítadlo XP sa pri prefers-reduced-motion
   neanimuje. Zavretie zmaže cookie, takže sa súhrn ukáže len raz. */

export interface FinishVM {
  durationText: string | null;
  volumeText: string;
  sets: number;
  prs: number;
  xp: number;
  missions: { key: string; text: string; state: string; done: boolean }[];
  bonusText: string | null;
  streakText: string;
  streakNote: string;
  freezeText: string | null;
  levelText: string | null;
  /** zvolený štýl osláv a či sa oslava vôbec ukáže (rekord / úroveň / splnená misia / bonus) */
  celebration: CelebrationId;
  celebrate: boolean;
}

function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || target <= 0) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

export function FinishSummaryModal({
  vm,
  labels,
}: {
  vm: FinishVM;
  labels: {
    title: string;
    sub: string;
    aria: string;
    duration: string;
    volume: string;
    sets: string;
    prs: string;
    xp: string;
    xpFormat: string; // „+{xp}“ — dosadí sa nižšie
    missions: string;
    close: string;
  };
}) {
  const [open, setOpen] = useState(true);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const xp = useCountUp(vm.xp);
  useOverlayActive("finish", open);

  const close = () => {
    setOpen(false);
    void clearFinishSummaryAction();
  };

  useEffect(() => {
    closeBtn.current?.focus();
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div className={g.scrim} style={{ zIndex: 90 }} onClick={close} data-testid="finish-summary">
      <div className={`${g.dialog} ${g2.fsDialog}`} role="dialog" aria-modal="true" aria-label={labels.aria} onClick={(e) => e.stopPropagation()}>
        {vm.celebrate && <CelebrationBurst style={vm.celebration} />}
        <h2 className={g2.fsTitle}>{labels.title}</h2>
        <p className={g2.fsSub}>{labels.sub}</p>

        <ul className={g2.fsGrid}>
          {vm.durationText && (
            <li className={g2.fsTile}>
              <span className={g2.fsNum}>{vm.durationText}</span>
              <span className={g2.fsLab}>{labels.duration}</span>
            </li>
          )}
          <li className={g2.fsTile}>
            <span className={g2.fsNum}>{vm.volumeText}</span>
            <span className={g2.fsLab}>{labels.volume}</span>
          </li>
          <li className={g2.fsTile}>
            <span className={g2.fsNum}>{vm.sets}</span>
            <span className={g2.fsLab}>{labels.sets}</span>
          </li>
          <li className={g2.fsTile}>
            <span className={`${g2.fsNum} ${vm.prs > 0 ? g2.fsNumHot : ""}`}>{vm.prs}</span>
            <span className={g2.fsLab}>{labels.prs}</span>
          </li>
          <li className={`${g2.fsTile} ${g2.fsXpTile}`}>
            <span className={g2.fsNum} aria-label={labels.xpFormat.replace("{xp}", String(vm.xp))} data-testid="finish-xp">
              {labels.xpFormat.replace("{xp}", String(xp))}
            </span>
            <span className={g2.fsLab}>{labels.xp}</span>
          </li>
        </ul>

        {(vm.missions.length > 0 || vm.bonusText) && (
          <div className={g2.fsSection}>
            <h3 className={g2.fsSectionTitle}>{labels.missions}</h3>
            {vm.missions.map((m) => (
              <div key={m.key} className={`${g2.fsMission} ${m.done ? g2.fsMissionDone : ""}`}>
                <span>{m.text}</span>
                <span className={g2.fsMissionState}>{m.state}</span>
              </div>
            ))}
            {vm.bonusText && <p className={g2.fsNote}>{vm.bonusText}</p>}
          </div>
        )}

        <div className={g2.fsSection}>
          <p className={g2.fsNote}>
            {vm.streakText} {vm.streakNote}
          </p>
          {vm.freezeText && <p className={g2.fsNote}>{vm.freezeText}</p>}
          {vm.levelText && <p className={g2.fsNote}>{vm.levelText}</p>}
        </div>

        <div className={g2.fsActions}>
          <button ref={closeBtn} type="button" className="btn btn-primary" onClick={close}>
            {labels.close}
          </button>
        </div>
      </div>
    </div>
  );
}
