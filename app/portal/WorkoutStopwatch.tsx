"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StopwatchIcon } from "./icons";
import styles from "./portal.module.css";
import {
  WORKOUT_STARTED_EVENT,
  clearWorkoutStarted,
  isWorkoutStarted,
} from "./workoutSession";

/**
 * Plávajúce stopky pre klienta počas tréningu. Po "Začať tréning" sa dole (nad
 * spodnou navigáciou) objaví ikona stopiek; ťuk otvorí panel s dvoma režimami —
 * Stopky (počítadlo nahor + medzičasy) a Časovač (odpočet pauzy medzi sériami s
 * predvoľbami a vibráciou na konci). Stav žije v localStorage, takže prežije
 * prepnutie tabu aj remount. Panel sa zatvára krížikom, ťukom mimo alebo Esc;
 * ikona ostáva, kým sa tréning neukončí (prop `finished`) alebo ju klient neskryje.
 */

const SW_KEY = "fitpilot.stopwatch.v1";
const TIMER_PRESETS_S = [60, 90, 120, 180];
const DEFAULT_TIMER_MS = 90_000;
const TIMER_MIN_MS = 15_000;
const TIMER_MAX_MS = 20 * 60_000;

type Mode = "stopwatch" | "timer";
type TimerStatus = "idle" | "running" | "paused" | "done";

type Snapshot = {
  mode: Mode;
  open: boolean;
  sw: { running: boolean; startedAt: number | null; accumMs: number; laps: number[] };
  timer: { status: TimerStatus; durationMs: number; endsAt: number | null; remainingMs: number };
};

function fmtStopwatch(ms: number): { main: string; cs: string } {
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  return { main: `${m}:${String(s).padStart(2, "0")}`, cs: String(cs).padStart(2, "0") };
}

function fmtClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function WorkoutStopwatch({ dayId, finished }: { dayId: string; finished: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(false);
  const [entrance, setEntrance] = useState(false); // pop-in len pri "Začať tréning", nie pri obnove z LS
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("stopwatch");
  const [now, setNow] = useState(() => Date.now());

  // Stopky (počítadlo nahor)
  const [swRunning, setSwRunning] = useState(false);
  const [swStartedAt, setSwStartedAt] = useState<number | null>(null);
  const [swAccumMs, setSwAccumMs] = useState(0);
  const [laps, setLaps] = useState<number[]>([]);

  // Časovač (odpočet)
  const [timerStatus, setTimerStatus] = useState<TimerStatus>("idle");
  const [timerDurationMs, setTimerDurationMs] = useState(DEFAULT_TIMER_MS);
  const [timerEndsAt, setTimerEndsAt] = useState<number | null>(null);
  const [timerRemainingMs, setTimerRemainingMs] = useState(DEFAULT_TIMER_MS);

  const fabRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // ---- init: obnov stav z localStorage / uprac po ukončenom tréningu ----
  useEffect(() => {
    setMounted(true);

    if (finished) {
      clearWorkoutStarted();
      try {
        localStorage.removeItem(SW_KEY);
      } catch {
        /* ignoruj */
      }
      setActive(false);
      return;
    }

    setActive(isWorkoutStarted(dayId));

    try {
      const raw = localStorage.getItem(SW_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as Partial<Snapshot>;

      setMode(p.mode === "timer" ? "timer" : "stopwatch");
      setOpen(Boolean(p.open));

      if (p.sw) {
        setSwRunning(Boolean(p.sw.running));
        setSwStartedAt(typeof p.sw.startedAt === "number" ? p.sw.startedAt : null);
        setSwAccumMs(Number(p.sw.accumMs) || 0);
        setLaps(Array.isArray(p.sw.laps) ? p.sw.laps.filter((n) => typeof n === "number") : []);
      }

      if (p.timer) {
        const dur = clampTimer(Number(p.timer.durationMs) || DEFAULT_TIMER_MS);
        setTimerDurationMs(dur);
        if (p.timer.status === "running" && typeof p.timer.endsAt === "number") {
          const rem = p.timer.endsAt - Date.now();
          if (rem <= 0) {
            setTimerStatus("done");
            setTimerRemainingMs(0);
          } else {
            setTimerStatus("running");
            setTimerEndsAt(p.timer.endsAt);
            setTimerRemainingMs(rem);
          }
        } else if (p.timer.status === "paused") {
          setTimerStatus("paused");
          setTimerRemainingMs(clampTimer(Number(p.timer.remainingMs) || dur));
        } else if (p.timer.status === "done") {
          setTimerStatus("done");
          setTimerRemainingMs(0);
        } else {
          setTimerStatus("idle");
          setTimerRemainingMs(dur);
        }
      }
    } catch {
      /* poškodený záznam — začni načisto */
    }
  }, [dayId, finished]);

  // ---- počúvaj "Začať tréning" ----
  useEffect(() => {
    const onStart = (e: Event) => {
      const detail = (e as CustomEvent<{ dayId?: string }>).detail;
      if (detail?.dayId && detail.dayId !== dayId) return;
      setActive(true);
      setEntrance(true);
      // nový tréning → čisté stopky aj časovač
      setSwRunning(false);
      setSwStartedAt(null);
      setSwAccumMs(0);
      setLaps([]);
      setTimerStatus("idle");
      setTimerEndsAt(null);
      setTimerRemainingMs(timerDurationMs);
    };
    window.addEventListener(WORKOUT_STARTED_EVENT, onStart);
    return () => window.removeEventListener(WORKOUT_STARTED_EVENT, onStart);
  }, [dayId, timerDurationMs]);

  // ---- tik displeja (len keď niečo beží) ----
  const ticking = swRunning || timerStatus === "running";
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(id);
  }, [ticking]);

  // ---- presné dobehnutie časovača (nezávislé od 50 ms tiku) ----
  const finishTimer = useCallback(() => {
    setTimerStatus("done");
    setTimerRemainingMs(0);
    setTimerEndsAt(null);
    try {
      navigator.vibrate?.([180, 90, 180, 90, 260]);
    } catch {
      /* zariadenie bez vibrácie — vizuálny stav "Pauza hotová" nesie signál sám */
    }
  }, []);

  useEffect(() => {
    if (timerStatus !== "running" || timerEndsAt == null) return;
    const rem = timerEndsAt - Date.now();
    if (rem <= 0) {
      finishTimer();
      return;
    }
    const id = window.setTimeout(finishTimer, rem);
    return () => window.clearTimeout(id);
  }, [timerStatus, timerEndsAt, finishTimer]);

  // ---- perzistuj snapshot ----
  useEffect(() => {
    if (!mounted || !active) return;
    const snap: Snapshot = {
      mode,
      open,
      sw: { running: swRunning, startedAt: swStartedAt, accumMs: swAccumMs, laps },
      timer: {
        status: timerStatus,
        durationMs: timerDurationMs,
        endsAt: timerEndsAt,
        remainingMs: timerRemainingMs,
      },
    };
    try {
      localStorage.setItem(SW_KEY, JSON.stringify(snap));
    } catch {
      /* ignoruj */
    }
  }, [
    mounted,
    active,
    mode,
    open,
    swRunning,
    swStartedAt,
    swAccumMs,
    laps,
    timerStatus,
    timerDurationMs,
    timerEndsAt,
    timerRemainingMs,
  ]);

  // ---- panel: Esc, fokus dnu/von ----
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    const t = window.setTimeout(() => closeRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      window.clearTimeout(t);
    };
  }, [open]);

  const closePanel = useCallback(() => {
    setOpen(false);
    fabRef.current?.focus();
  }, []);

  if (!mounted || !active) return null;

  // ---- odvodené hodnoty ----
  const swElapsed = swRunning && swStartedAt != null ? swAccumMs + (now - swStartedAt) : swAccumMs;
  const timerRemaining =
    timerStatus === "running" && timerEndsAt != null
      ? Math.max(0, timerEndsAt - now)
      : timerStatus === "done"
        ? 0
        : timerRemainingMs;

  const sw = fmtStopwatch(swElapsed);
  const timerLow = timerStatus === "running" && timerRemaining <= 10_000;
  const alarm = timerStatus === "done";

  // FAB text: bežiaci režim ukáž glanceable, inak len ikonu
  let fabTime: string | null = null;
  if (mode === "timer" && (timerStatus === "running" || timerStatus === "done")) {
    fabTime = alarm ? "0:00" : fmtClock(timerRemaining);
  } else if (mode === "stopwatch" && (swRunning || swElapsed > 0)) {
    fabTime = sw.main;
  }
  const fabAccent = alarm || timerLow ? styles.swFabAlarm : fabTime ? styles.swFabRun : "";

  // ---- akcie: stopky ----
  const swStart = () => {
    setSwRunning(true);
    setSwStartedAt(Date.now());
    setNow(Date.now());
  };
  const swPause = () => {
    setSwAccumMs(swElapsed);
    setSwRunning(false);
    setSwStartedAt(null);
  };
  const swReset = () => {
    setSwRunning(false);
    setSwStartedAt(null);
    setSwAccumMs(0);
    setLaps([]);
  };
  const swLap = () => setLaps((prev) => [swElapsed, ...prev].slice(0, 20));

  // ---- akcie: časovač ----
  const setDuration = (ms: number) => {
    const next = clampTimer(ms);
    setTimerDurationMs(next);
    setTimerStatus("idle");
    setTimerEndsAt(null);
    setTimerRemainingMs(next);
  };
  const timerStart = (fromMs?: number) => {
    const base = fromMs ?? timerDurationMs;
    setTimerStatus("running");
    setTimerEndsAt(Date.now() + base);
    setTimerRemainingMs(base);
    setNow(Date.now());
  };
  const timerPause = () => {
    setTimerRemainingMs(timerRemaining);
    setTimerStatus("paused");
    setTimerEndsAt(null);
  };
  const timerReset = () => {
    setTimerStatus("idle");
    setTimerEndsAt(null);
    setTimerRemainingMs(timerDurationMs);
  };

  const timerActivePreset = TIMER_PRESETS_S.find((s) => s * 1000 === timerDurationMs) ?? null;

  return (
    <>
      {open && (
        <button
          type="button"
          tabIndex={-1}
          className={styles.swScrim}
          aria-label="Zavrieť stopky"
          onClick={closePanel}
        />
      )}

      <button
        ref={fabRef}
        type="button"
        className={`${styles.swFab} ${entrance ? styles.swFabIn : ""} ${fabAccent} ${open ? styles.swFabOpen : ""}`}
        aria-expanded={open}
        aria-label={
          fabTime
            ? `Stopky — ${mode === "timer" ? "časovač" : "počítadlo"} ${fabTime}. Otvoriť panel.`
            : "Otvoriť stopky"
        }
        onClick={() => setOpen((v) => !v)}
      >
        <StopwatchIcon className={styles.swFabIcon} />
        {fabTime && (
          <span className={`${styles.swFabTime} num`} aria-hidden="true">
            {fabTime}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className={styles.swPanel}
          role="dialog"
          aria-modal="true"
          aria-label="Stopky a časovač"
        >
          <div className={styles.swHead}>
            <p className={styles.swTitle}>Stopky</p>
            <button ref={closeRef} type="button" className={styles.swClose} onClick={closePanel} aria-label="Zavrieť">
              <CloseIcon />
            </button>
          </div>

          <div className={styles.swSeg} role="group" aria-label="Režim">
            <button
              type="button"
              className={`${styles.swSegBtn} ${mode === "stopwatch" ? styles.swSegBtnOn : ""}`}
              aria-pressed={mode === "stopwatch"}
              onClick={() => setMode("stopwatch")}
            >
              Stopky
            </button>
            <button
              type="button"
              className={`${styles.swSegBtn} ${mode === "timer" ? styles.swSegBtnOn : ""}`}
              aria-pressed={mode === "timer"}
              onClick={() => setMode("timer")}
            >
              Časovač
            </button>
          </div>

          {mode === "stopwatch" ? (
            <div className={styles.swBody}>
              <p className={`${styles.swReadout} num`} aria-hidden="true">
                {sw.main}
                <span className={styles.swReadoutFrac}>.{sw.cs}</span>
              </p>
              <p className={styles.swStatus} aria-live="polite">
                {swRunning ? "Beží" : swElapsed > 0 ? "Zastavené" : "Pripravené"}
              </p>

              <div className={styles.swControls}>
                {swRunning ? (
                  <>
                    <button type="button" className={styles.swBtnGhost} onClick={swLap}>
                      Medzičas
                    </button>
                    <button type="button" className={styles.swBtnPrimary} onClick={swPause}>
                      Pauza
                    </button>
                  </>
                ) : swElapsed > 0 ? (
                  <>
                    <button type="button" className={styles.swBtnGhost} onClick={swReset}>
                      Nulovať
                    </button>
                    <button type="button" className={styles.swBtnPrimary} onClick={swStart}>
                      Pokračovať
                    </button>
                  </>
                ) : (
                  <button type="button" className={styles.swBtnPrimary} onClick={swStart}>
                    Štart
                  </button>
                )}
              </div>

              {laps.length > 0 && (
                <ol className={styles.swLaps}>
                  {laps.map((lap, i) => {
                    const lapNo = laps.length - i;
                    const split = lap - (laps[i + 1] ?? 0);
                    const f = fmtStopwatch(lap);
                    const s = fmtStopwatch(split);
                    return (
                      <li key={lapNo} className={styles.swLapRow}>
                        <span className={styles.swLapNo}>#{lapNo}</span>
                        <span className={`${styles.swLapSplit} num`}>
                          +{s.main}.{s.cs}
                        </span>
                        <span className={`${styles.swLapTotal} num`}>
                          {f.main}.{f.cs}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          ) : (
            <div className={styles.swBody}>
              <p
                className={`${styles.swReadout} num ${alarm ? styles.swReadoutAlarm : timerLow ? styles.swReadoutLow : ""}`}
                aria-hidden="true"
              >
                {fmtClock(timerRemaining)}
              </p>
              <p className={styles.swStatus} aria-live="polite">
                {alarm
                  ? "Pauza hotová"
                  : timerStatus === "running"
                    ? "Odpočet beží"
                    : timerStatus === "paused"
                      ? "Pozastavené"
                      : "Nastav dĺžku pauzy"}
              </p>

              {(timerStatus === "idle" || timerStatus === "done") && (
                <>
                  <div className={styles.swPresets}>
                    {TIMER_PRESETS_S.map((s) => (
                      <button
                        type="button"
                        key={s}
                        className={`${styles.swPreset} ${timerActivePreset === s ? styles.swPresetOn : ""}`}
                        onClick={() => setDuration(s * 1000)}
                      >
                        {s}s
                      </button>
                    ))}
                  </div>
                  <div className={styles.swStepper}>
                    <button
                      type="button"
                      className={styles.swStep}
                      onClick={() => setDuration(timerDurationMs - 15_000)}
                      disabled={timerDurationMs <= TIMER_MIN_MS}
                      aria-label="Skrátiť o 15 sekúnd"
                    >
                      −15s
                    </button>
                    <span className={`${styles.swStepValue} num`}>{fmtClock(timerDurationMs)}</span>
                    <button
                      type="button"
                      className={styles.swStep}
                      onClick={() => setDuration(timerDurationMs + 15_000)}
                      disabled={timerDurationMs >= TIMER_MAX_MS}
                      aria-label="Predĺžiť o 15 sekúnd"
                    >
                      +15s
                    </button>
                  </div>
                </>
              )}

              <div className={styles.swControls}>
                {timerStatus === "running" ? (
                  <>
                    <button type="button" className={styles.swBtnGhost} onClick={timerReset}>
                      Nulovať
                    </button>
                    <button type="button" className={styles.swBtnPrimary} onClick={timerPause}>
                      Pauza
                    </button>
                  </>
                ) : timerStatus === "paused" ? (
                  <>
                    <button type="button" className={styles.swBtnGhost} onClick={timerReset}>
                      Nulovať
                    </button>
                    <button type="button" className={styles.swBtnPrimary} onClick={() => timerStart(timerRemainingMs)}>
                      Pokračovať
                    </button>
                  </>
                ) : (
                  <button type="button" className={styles.swBtnPrimary} onClick={() => timerStart()}>
                    {alarm ? "Znova" : "Štart"}
                  </button>
                )}
              </div>
            </div>
          )}

          <button type="button" className={styles.swHide} onClick={() => { setActive(false); clearWorkoutStarted(); try { localStorage.removeItem(SW_KEY); } catch {} }}>
            Skryť stopky
          </button>
        </div>
      )}
    </>
  );
}

function clampTimer(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_TIMER_MS;
  return Math.min(TIMER_MAX_MS, Math.max(TIMER_MIN_MS, Math.round(ms / 1000) * 1000));
}

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </svg>
);
