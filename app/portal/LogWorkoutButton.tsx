"use client";

import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PortalExercise } from "@/lib/portal/types";
import { finishWorkoutAction, type ActionState } from "./actions";
import styles from "./portal.module.css";
import {
  WORKOUT_STARTED_EVENT,
  clearWorkoutDraft,
  isWorkoutStarted,
  loadWorkoutDraft,
  markWorkoutStarted,
  saveWorkoutDraft,
} from "./workoutSession";
import { WorkoutSetsFields, buildEntriesPayload, emptyFormValues, type WorkoutFormValues } from "./WorkoutSetsFields";

const initialState: ActionState = { error: null };

const ArrowIcon = () => (
  <svg className={styles.startArrow} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Zmena príznaku "tréning začatý" — markWorkoutStarted (event) alebo iný tab (storage). */
function subscribeStarted(onChange: () => void): () => void {
  window.addEventListener(WORKOUT_STARTED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(WORKOUT_STARTED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * "Začať tréning" je lokálny prepínač, ktorý rozbalí formulár skutočných hodnôt
 * (Fáza B) — pre každý cvik toľko riadkov sérií, koľko plánuje builder, s možnosťou
 * pridať/odobrať (WorkoutSetsFields). Pri "Ukončiť tréning" sa vyplnené riadky
 * serializujú do skrytého poľa a odošlú spolu s day_id. Po úspechu server
 * zrevaliduje /portal a session.kind sa zmení na "done" (viď lib/portal/data.ts).
 *
 * Rozpísané hodnoty sa priebežne ukladajú do localStorage (prežijú prepnutie tabu
 * aj refresh), polia prijímajú desatinnú čiarku a neplatné hodnoty zablokujú
 * ukončenie (lib/workouts/setInput.ts). Po ukončení sa hodnoty dajú ešte 24 h
 * opraviť cez "Upraviť hodnoty" (0049), potom je záznam zamknutý.
 */
export function LogWorkoutButton({ dayId, exercises }: { dayId: string; exercises: PortalExercise[] }) {
  // "Tréning začatý" čítame z localStorage UŽ pri prvom vykreslení (useSyncExternalStore),
  // nie až v useEffect — inak karta Dnes po "Začať tréning" v sekcii Tréning na okamih
  // ukázala tlačidlo "Začať tréning" a až potom formulár (záblesk). Na serveri a počas
  // hydratácie je stav "unknown" → neviditeľné tlačidlo rovnakej výšky, nič neposkočí.
  const storedStarted = useSyncExternalStore(
    subscribeStarted,
    () => (isWorkoutStarted(dayId) ? "yes" : "no"),
    () => "unknown",
  );
  // Záloha, keď localStorage nejde (súkromný režim) — klik aj tak formulár otvorí.
  const [localStarted, setLocalStarted] = useState(false);
  const started = localStarted || storedStarted === "yes";

  const signature = exercises.map((ex) => ex.entryId ?? ex.name).join("|");
  // Rozpísané hodnoty z localStorage hneď pri vytvorení stavu (na serveri vráti null).
  // Formulár sa počas hydratácie nevykresľuje ("unknown"), takže to nespôsobí nesúlad.
  const [values, setValues] = useState<WorkoutFormValues>(() => {
    const draft = loadWorkoutDraft(dayId, signature);
    return draft
      ? { rows: draft.rows, notes: draft.notes, rpe: draft.rpe, sessionNote: draft.sessionNote }
      : emptyFormValues(exercises);
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(finishWorkoutAction, initialState);
  const [showInvalid, setShowInvalid] = useState(false);

  // Esc zavrie potvrdenie (= "Pokračovať", nie "Ukončiť") — bezpečný default pre
  // klávesnicu, rovnaké správanie ako panel stopiek.
  useEffect(() => {
    if (!confirmOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen]);

  // Rozpísané hodnoty priebežne do localStorage (prežijú prepnutie tabu aj refresh).
  useEffect(() => {
    if (!started) return;
    saveWorkoutDraft(dayId, { signature, ...values });
  }, [started, dayId, signature, values]);

  // Úspešné ukončenie → koncept už netreba (pri chybe ostáva, klient to skúsi znova).
  useEffect(() => {
    if (state !== initialState && !state.error) clearWorkoutDraft();
  }, [state]);

  const beginWorkout = () => {
    setLocalStarted(true);
    markWorkoutStarted(dayId); // zapíše príznak + emituje event pre WorkoutStopwatch
  };

  if (storedStarted === "unknown" && !localStarted) {
    // Server / hydratácia: stav ešte nepoznáme — rezervuj miesto, nič nesprávne neukazuj.
    return (
      <button type="button" className={`btn btn-primary ${styles.startBtn}`} style={{ visibility: "hidden" }} tabIndex={-1} aria-hidden="true">
        Začať tréning
        <ArrowIcon />
      </button>
    );
  }

  if (!started) {
    return (
      <button type="button" className={`btn btn-primary ${styles.startBtn}`} onClick={beginWorkout}>
        Začať tréning
        <ArrowIcon />
      </button>
    );
  }

  const { summary, entries } = buildEntriesPayload(exercises, values);
  const emptyNames = summary.emptyExercises.map((i) => exercises[i]?.name).filter(Boolean);

  const askFinish = () => {
    if (summary.invalidCount > 0) {
      setShowInvalid(true);
      return;
    }
    setConfirmOpen(true);
  };

  return (
    <form ref={formRef} action={formAction} className={styles.logForm}>
      <input type="hidden" name="day_id" value={dayId} readOnly />
      <input type="hidden" name="entries" value={JSON.stringify(entries)} readOnly />
      <input type="hidden" name="rpe" value={values.rpe} readOnly />
      <input type="hidden" name="note" value={values.sessionNote} readOnly />

      <WorkoutSetsFields exercises={exercises} values={values} onChange={setValues} showInvalid={showInvalid} />

      <button
        type="button"
        className={`btn btn-primary ${styles.startBtn}`}
        disabled={pending}
        onClick={askFinish}
      >
        {pending ? "Ukladám…" : "Ukončiť tréning"}
      </button>
      {showInvalid && summary.invalidCount > 0 && (
        <p role="alert" style={{ color: "var(--error)", fontSize: 12, marginTop: 8, textAlign: "center" }}>
          Oprav označené hodnoty.
        </p>
      )}
      {state.error && (
        <p style={{ color: "var(--error)", fontSize: 12, marginTop: 8, textAlign: "center" }}>{state.error}</p>
      )}

      {confirmOpen && (
        <>
          <button
            type="button"
            className={styles.swScrim}
            aria-label="Zavrieť"
            onClick={() => setConfirmOpen(false)}
          />
          <div className={styles.confirmPanel} role="alertdialog" aria-modal="true" aria-labelledby="finish-confirm-title">
            <p id="finish-confirm-title" className={styles.confirmTitle}>
              Ukončiť tréning?
            </p>
            {summary.nothingLogged ? (
              <p className={`${styles.confirmBody} ${styles.confirmWarn}`}>
                Nezapísal si žiadnu sériu. Hodnoty môžeš doplniť ešte 24 hodín cez „Upraviť hodnoty“.
              </p>
            ) : (
              <>
                <p className={styles.confirmBody}>
                  Zapíšeme dnešné série presne tak, ako si ich zadal. Ak si to ešte nedokončil, radšej pokračuj —
                  zabudnuté hodnoty môžeš opraviť ešte 24 hodín po ukončení.
                </p>
                {emptyNames.length > 0 && (
                  <p className={`${styles.confirmBody} ${styles.confirmWarn}`}>
                    Bez zápisu: {emptyNames.join(", ")}.
                  </p>
                )}
              </>
            )}
            <div className={styles.confirmActions}>
              <button type="button" className={styles.swBtnGhost} onClick={() => setConfirmOpen(false)}>
                Pokračovať v tréningu
              </button>
              <button
                type="button"
                className={styles.swBtnPrimary}
                onClick={() => {
                  setConfirmOpen(false);
                  formRef.current?.requestSubmit();
                }}
              >
                Áno, ukončiť
              </button>
            </div>
          </div>
        </>
      )}
    </form>
  );
}
