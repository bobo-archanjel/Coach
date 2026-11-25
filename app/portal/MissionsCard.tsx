"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { AppLink as Link } from "../components/AppLink";
import g from "../components/gamification.module.css";
import g2 from "../components/gamificationV2.module.css";

/* Týždenné misie klienta (lib/gamification/missions.ts). Texty prichádzajú hotové zo servera (MissionsHost),
   progres je vypočítaný zo skutočných dát — klient tu nič nezapisuje. Kompaktná verzia je na karte Dnes,
   plná na stránke Úspechy. Keď sú splnené všetky tri, ukáže sa raz malá oslava (konfety len pri povolenom
   pohybe; stav „už oslávené“ sa drží v localStorage podľa týždňa). */

export interface MissionVM {
  id: string;
  text: string;
  value: number;
  goal: number;
  done: boolean;
  xp: number;
  /** text postupu, napr. „2 z 3“ */
  progressText: string;
  /** zrozumiteľný popis pre čítačku */
  aria: string;
}

const CONFETTI = Array.from({ length: 14 }, (_, i) => ({
  x: `${8 + ((i * 41) % 84)}%`,
  d: `${(i % 5) * 90}ms`,
  r: `${(i % 2 ? 1 : -1) * (180 + ((i * 53) % 240))}deg`,
  c: ["var(--accent)", "var(--moss)", "var(--plate-yellow)", "var(--info)"][i % 4],
}));

const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function MissionsCard({
  weekStart,
  missions,
  allDone,
  compact,
  labels,
}: {
  weekStart: string;
  missions: MissionVM[];
  allDone: boolean;
  compact: boolean;
  labels: {
    title: string;
    sub: string;
    bonusPending: string;
    bonusDone: string;
    allDoneTitle: string;
    celebrate: string;
    viewAll: string;
    done: string;
  };
}) {
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (!allDone) return;
    const key = `fp.missions.celebrated.${weekStart}`;
    try {
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, "1");
        setFresh(true);
      }
    } catch {
      /* súkromný režim — oslava sa len neukáže */
    }
  }, [allDone, weekStart]);

  const doneCount = missions.filter((m) => m.done).length;
  return (
    <section className={`${g.card} ${g2.msCard}`} aria-label={labels.title} data-testid={compact ? "missions-compact" : "missions"} data-done={doneCount}>
      <div className={g2.msHead}>
        <h2 className={g2.msTitle}>{labels.title}</h2>
        {compact && (
          <Link href="/portal/uspechy" className={g.moreLink}>
            {labels.viewAll}
          </Link>
        )}
      </div>
      {!compact && <p className={g2.msSub}>{labels.sub}</p>}

      <ul className={g2.msList}>
        {missions.map((m) => {
          const pct = Math.round((Math.min(m.value, m.goal) / Math.max(1, m.goal)) * 100);
          return (
            <li key={m.id} className={`${g2.msItem} ${m.done ? g2.msItemDone : ""}`} data-mission-done={m.done ? "1" : "0"}>
              <div className={g2.msRow}>
                <span className={`${g2.msMark} ${m.done ? `${g2.msMarkDone} ${fresh ? g2.msMarkPop : ""}` : ""}`} aria-hidden="true">
                  {m.done ? <Check /> : null}
                </span>
                <span className={g2.msName}>{m.text}</span>
                <span className={g2.msXp}>+{m.xp} XP</span>
              </div>
              <div
                className={g2.msBar}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                aria-label={m.aria}
              >
                <span className={g2.msBarFill} style={{ "--p": pct / 100 } as CSSProperties} />
              </div>
              {!compact && (
                <div className={g2.msFoot}>
                  <span>{m.done ? labels.done : m.progressText}</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {allDone ? (
        <div className={`${g2.msBonus} ${g2.msBonusDone} ${fresh ? g2.msBonusPop : ""}`} role="status" data-testid="missions-bonus">
          <strong>{labels.allDoneTitle}</strong> {labels.bonusDone}
          {fresh && !compact && <span className={g.confetti} aria-hidden="true">{CONFETTI.map((c, i) => (
            <i key={i} style={{ ["--x" as string]: c.x, ["--d" as string]: c.d, ["--r" as string]: c.r, ["--c" as string]: c.c }} />
          ))}</span>}
        </div>
      ) : (
        !compact && <p className={g2.msBonus}>{labels.bonusPending}</p>
      )}
    </section>
  );
}
