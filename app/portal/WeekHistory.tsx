"use client";

import { useCallback, useEffect, useState } from "react";
import { getPortalWeekAction } from "./actions";
import type { WeekDay, WeekView } from "@/lib/portal/types";
import styles from "./portal.module.css";

/* Pás „Tento týždeň" na karte Dnes — okrem aktuálneho týždňa sa dá listovať
   dozadu (šípky), a ťuk na deň s odcvičeným tréningom otvorí náhľad toho, čo
   klient v ten deň spravil (workout_logs.entries). Dáta: lib/portal/data.ts →
   buildWeekView; iné týždne cez server action getPortalWeekAction. */

const MARK_CLASS: Record<WeekDay["state"], string> = {
  done: styles.markDone,
  today: styles.markToday,
  future: styles.markFuture,
  none: styles.markRest,
};

const ChevronIcon = ({ dir }: { dir: "left" | "right" }) => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d={dir === "left" ? "M9.5 3.5 5 8l4.5 4.5" : "M6.5 3.5 11 8l-4.5 4.5"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function shiftIso(mondayIso: string, deltaWeeks: number): string {
  const d = new Date(`${mondayIso}T12:00:00Z`);
  return new Date(d.getTime() + deltaWeeks * 7 * 86_400_000).toISOString().slice(0, 10);
}

function fullDate(iso: string): string {
  const label = new Date(`${iso}T12:00:00Z`).toLocaleDateString("sk-SK", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function setLabel(reps: number | null, weight: number | null): string {
  const r = reps != null ? `${reps} op.` : "—";
  return weight != null ? `${r} × ${weight} kg` : r;
}

export function WeekHistory({ initial }: { initial: WeekView }) {
  const [week, setWeek] = useState<WeekView>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openIso, setOpenIso] = useState<string | null>(null);

  const load = useCallback(async (mondayIso: string) => {
    setLoading(true);
    setError(null);
    const res = await getPortalWeekAction(mondayIso);
    setLoading(false);
    if (res.state === "ok") setWeek(res.week);
    else setError(res.message ?? "Týždeň sa nepodarilo načítať.");
  }, []);

  const openDay = openIso ? week.days.find((d) => d.iso === openIso) ?? null : null;
  const hasHistory = week.days.some((d) => d.sessions.length > 0);

  return (
    <div className={styles.panel}>
      <div className={styles.weekHead}>
        <p className={styles.panelLabel}>{week.isCurrentWeek ? "Tento týždeň" : "Týždeň"}</p>
        <div className={styles.weekPager}>
          <button
            type="button"
            className={styles.weekNav}
            onClick={() => load(shiftIso(week.mondayIso, -1))}
            disabled={loading}
            aria-label="Predchádzajúci týždeň"
          >
            <ChevronIcon dir="left" />
          </button>
          <span className={styles.weekRange}>{week.rangeLabel}</span>
          <button
            type="button"
            className={styles.weekNav}
            onClick={() => load(shiftIso(week.mondayIso, 1))}
            disabled={loading || week.isCurrentWeek}
            aria-label="Nasledujúci týždeň"
          >
            <ChevronIcon dir="right" />
          </button>
        </div>
      </div>

      <div className={`${styles.week} ${loading ? styles.weekLoading : ""}`}>
        {week.days.map((day) => {
          const clickable = day.sessions.length > 0;
          const className = `${styles.weekCell} ${day.state === "today" ? styles.weekCellToday : ""} ${
            clickable ? styles.weekCellClickable : ""
          }`;
          const inner = (
            <>
              <span className={styles.weekDay}>{day.label}</span>
              <span className={styles.weekMark}>
                <span className={`${styles.weekDot} ${MARK_CLASS[day.state]}`} />
              </span>
              <span className={styles.weekNum}>{day.dayNum}</span>
            </>
          );
          return clickable ? (
            <button
              key={day.iso}
              type="button"
              className={className}
              onClick={() => setOpenIso(day.iso)}
              aria-label={`${fullDate(day.iso)} — zobraziť odcvičený tréning`}
            >
              {inner}
            </button>
          ) : (
            <div key={day.iso} className={className} aria-current={day.state === "today" ? "date" : undefined}>
              {inner}
            </div>
          );
        })}
      </div>

      {error ? (
        <p className={styles.weekNote}>
          {error}{" "}
          <button type="button" className={styles.weekRetry} onClick={() => load(week.mondayIso)}>
            Skúsiť znova
          </button>
        </p>
      ) : (
        !week.isCurrentWeek &&
        !hasHistory &&
        !loading && <p className={styles.weekNote}>V tomto týždni žiadny odcvičený tréning.</p>
      )}

      {openDay && <SessionDialog day={openDay} onClose={() => setOpenIso(null)} />}
    </div>
  );
}

function SessionDialog({ day, onClose }: { day: WeekDay; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const multi = day.sessions.length > 1;

  return (
    <>
      <button type="button" className={styles.whScrim} aria-label="Zavrieť náhľad" onClick={onClose} />
      <div className={styles.whPanel} role="dialog" aria-modal="true" aria-label={`Tréning ${fullDate(day.iso)}`}>
        <div className={styles.whHead}>
          <div>
            <h3 className={styles.whTitle}>{fullDate(day.iso)}</h3>
            <p className={styles.whSub}>{multi ? `${day.sessions.length} tréningy` : day.sessions[0]?.dayName}</p>
          </div>
          <button type="button" className={styles.whClose} onClick={onClose} aria-label="Zavrieť">
            <CloseIcon />
          </button>
        </div>

        <div className={styles.whBody}>
          {day.sessions.map((session, si) => (
            <section key={si} className={styles.whSession}>
              <div className={styles.whSessionHead}>
                {multi && <p className={styles.whSessionName}>{session.dayName}</p>}
                {session.planName && <span className={styles.whPlan}>{session.planName}</span>}
              </div>

              {session.exercises.length > 0 ? (
                <ul className={styles.whExList}>
                  {session.exercises.map((ex, ei) => (
                    <li key={ei} className={styles.whExRow}>
                      <p className={styles.whExName}>{ex.name}</p>
                      <ol className={styles.whSetList}>
                        {ex.sets.length > 0 ? (
                          ex.sets.map((s, k) => <li key={k}>{setLabel(s.reps, s.weight)}</li>)
                        ) : (
                          <li className={styles.whSetEmpty}>bez zápisu sérií</li>
                        )}
                      </ol>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.whNoEntries}>
                  <CheckIcon /> Tréning označený ako hotový — bez zápisu skutočných sérií.
                </p>
              )}
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
