"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { PortalExercise } from "@/lib/portal/types";
import { parseReps, parseWeight, summarizeWorkoutForm } from "@/lib/workouts/setInput";
import { finishWorkoutAction, type ActionState } from "./actions";
import styles from "./portal.module.css";
import {
  clearWorkoutDraft,
  isWorkoutStarted,
  loadWorkoutDraft,
  markWorkoutStarted,
  saveWorkoutDraft,
} from "./workoutSession";

const initialState: ActionState = { error: null };

const ArrowIcon = () => (
  <svg className={styles.startArrow} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PlusIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

const RemoveIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

type SetRow = { reps: string; weight: string };

/** Predvyplní riadky sérií podľa plánu buildera — klient ich vie doplniť/odobrať. */
function initialRows(ex: PortalExercise): SetRow[] {
  return Array.from({ length: ex.plannedSets }, () => ({ reps: "", weight: "" }));
}

/** Váha z plánu ako placeholder ("60" / "62,5") — klient vidí, čo má dvíhať. */
function weightPlaceholder(kg: number | null): string {
  return kg != null ? kg.toLocaleString("sk-SK", { maximumFractionDigits: 2 }) : "kg";
}

/**
 * "Začať tréning" je lokálny prepínač, ktorý rozbalí formulár skutočných hodnôt
 * (Fáza B) — pre každý cvik toľko riadkov sérií, koľko plánuje builder, s možnosťou
 * pridať/odobrať. Pri "Ukončiť tréning" sa vyplnené riadky serializujú do skrytého
 * poľa a odošlú spolu s day_id. Po úspechu server zrevaliduje /portal a session.kind
 * sa zmení na "done" (viď lib/portal/data.ts), takže sa toto tlačidlo prestane
 * zobrazovať samo.
 *
 * Ukončený tréning je zamknutý (0048), preto: rozpísané hodnoty sa priebežne
 * ukladajú do localStorage (prežijú prepnutie tabu aj refresh), polia prijímajú
 * desatinnú čiarku a neplatné hodnoty zablokujú ukončenie, a potvrdenie
 * upozorní na cviky bez zápisu (lib/workouts/setInput.ts).
 */
export function LogWorkoutButton({ dayId, exercises }: { dayId: string; exercises: PortalExercise[] }) {
  const [started, setStarted] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [rows, setRows] = useState<Record<number, SetRow[]>>(() =>
    Object.fromEntries(exercises.map((ex, i) => [i, initialRows(ex)])),
  );
  // Poznámka ku cviku (index → text); `undefined` = pole ešte nie je rozbalené.
  const [notes, setNotes] = useState<Record<number, string | undefined>>({});
  const [rpe, setRpe] = useState("");
  const [sessionNote, setSessionNote] = useState("");
  const [state, formAction, pending] = useActionState(finishWorkoutAction, initialState);
  const [showInvalid, setShowInvalid] = useState(false);
  const signature = exercises.map((ex) => ex.entryId ?? ex.name).join("|");
  // Kým sa koncept z localStorage neobnoví, neukladaj — prázdny počiatočný stav by ho prepísal.
  const draftReady = useRef(false);

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

  // Prepnutie tabu v portáli remountuje túto kartu — obnov "tréning začatý" aj
  // rozpísané hodnoty z localStorage, nech klient nepríde o zapísané série.
  useEffect(() => {
    if (isWorkoutStarted(dayId)) setStarted(true);
    const draft = loadWorkoutDraft(dayId, signature);
    if (draft) {
      setRows(draft.rows);
      setNotes(draft.notes);
      setRpe(draft.rpe);
      setSessionNote(draft.sessionNote);
    }
    draftReady.current = true;
  }, [dayId, signature]);

  useEffect(() => {
    if (!started || !draftReady.current) return;
    saveWorkoutDraft(dayId, { signature, rows, notes, rpe, sessionNote });
  }, [started, dayId, signature, rows, notes, rpe, sessionNote]);

  // Úspešné ukončenie → koncept už netreba (pri chybe ostáva, klient to skúsi znova).
  useEffect(() => {
    if (state !== initialState && !state.error) clearWorkoutDraft();
  }, [state]);

  const beginWorkout = () => {
    setStarted(true);
    markWorkoutStarted(dayId); // zapíše príznak + emituje event pre WorkoutStopwatch
  };

  if (!started) {
    return (
      <button type="button" className={`btn btn-primary ${styles.startBtn}`} onClick={beginWorkout}>
        Začať tréning
        <ArrowIcon />
      </button>
    );
  }

  const updateRow = (exIdx: number, rowIdx: number, field: keyof SetRow, value: string) => {
    setRows((prev) => {
      const next = [...(prev[exIdx] ?? [])];
      next[rowIdx] = { ...next[rowIdx], [field]: value };
      return { ...prev, [exIdx]: next };
    });
  };
  const addRow = (exIdx: number) => {
    setRows((prev) => ({ ...prev, [exIdx]: [...(prev[exIdx] ?? []), { reps: "", weight: "" }] }));
  };
  const removeRow = (exIdx: number, rowIdx: number) => {
    setRows((prev) => ({ ...prev, [exIdx]: (prev[exIdx] ?? []).filter((_, i) => i !== rowIdx) }));
  };

  // Prázdne riadky (klient nechal reps aj váhu prázdne) sa vôbec neposielajú.
  const summary = summarizeWorkoutForm(exercises.length, rows);
  const entriesPayload = exercises.map((ex, i) => ({
    entryId: ex.entryId,
    name: ex.name,
    note: notes[i]?.trim() || undefined,
    sets: summary.sets[i] ?? [],
  }));
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
      <input type="hidden" name="entries" value={JSON.stringify(entriesPayload)} readOnly />
      <input type="hidden" name="rpe" value={rpe} readOnly />
      <input type="hidden" name="note" value={sessionNote} readOnly />

      {exercises.map((ex, exIdx) => (
        <div key={`${ex.idx}-${exIdx}`} className={styles.logExercise}>
          <p className={styles.logExerciseName}>{ex.name}</p>
          <div className={styles.logRows}>
            {(rows[exIdx] ?? []).map((row, rowIdx) => {
              const repsErr = parseReps(row.reps).error;
              const weightErr = parseWeight(row.weight).error;
              const rowErr = showInvalid ? (repsErr ?? weightErr) : null;
              return (
                <div key={rowIdx}>
                  <div className={styles.setRow}>
                    <span className={styles.setNum}>{rowIdx + 1}</span>
                    <label className={`${styles.setField} ${showInvalid && repsErr ? styles.setFieldInvalid : ""}`}>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder={ex.plannedReps ?? "op."}
                        aria-label={`${ex.name}, séria ${rowIdx + 1}, opakovania`}
                        aria-invalid={showInvalid && repsErr ? true : undefined}
                        value={row.reps}
                        onChange={(e) => updateRow(exIdx, rowIdx, "reps", e.target.value)}
                      />
                      <span>op.</span>
                    </label>
                    <label className={`${styles.setField} ${showInvalid && weightErr ? styles.setFieldInvalid : ""}`}>
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder={weightPlaceholder(ex.loadKg)}
                        aria-label={`${ex.name}, séria ${rowIdx + 1}, váha v kg`}
                        aria-invalid={showInvalid && weightErr ? true : undefined}
                        value={row.weight}
                        onChange={(e) => updateRow(exIdx, rowIdx, "weight", e.target.value)}
                      />
                      <span>kg</span>
                    </label>
                    <button
                      type="button"
                      className={styles.setRemove}
                      onClick={() => removeRow(exIdx, rowIdx)}
                      aria-label="Odobrať sériu"
                    >
                      <RemoveIcon />
                    </button>
                  </div>
                  {rowErr && <p className={styles.setError}>{rowErr}</p>}
                </div>
              );
            })}
          </div>
          <div className={styles.logExerciseActions}>
            <button type="button" className={styles.addSetBtn} onClick={() => addRow(exIdx)}>
              <PlusIcon /> Pridať sériu
            </button>
            {notes[exIdx] === undefined && (
              <button
                type="button"
                className={styles.addSetBtn}
                onClick={() => setNotes((prev) => ({ ...prev, [exIdx]: "" }))}
              >
                <PlusIcon /> Poznámka
              </button>
            )}
          </div>
          {notes[exIdx] !== undefined && (
            <textarea
              className={styles.logNoteInput}
              rows={2}
              maxLength={500}
              placeholder="Poznámka k cviku pre trénera (nepovinné)"
              aria-label={`Poznámka k cviku ${ex.name}`}
              value={notes[exIdx]}
              onChange={(e) => setNotes((prev) => ({ ...prev, [exIdx]: e.target.value }))}
            />
          )}
        </div>
      ))}

      <div className={styles.logSessionMeta}>
        <label className={styles.logRpeField}>
          <span>Náročnosť tréningu (RPE)</span>
          <select value={rpe} onChange={(e) => setRpe(e.target.value)}>
            <option value="">—</option>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
                {n === 1 ? " – veľmi ľahké" : n === 10 ? " – maximum" : ""}
              </option>
            ))}
          </select>
        </label>
        <textarea
          className={styles.logNoteInput}
          rows={2}
          maxLength={1000}
          placeholder="Ako sa ti cvičilo? (nepovinné)"
          aria-label="Poznámka k tréningu"
          value={sessionNote}
          onChange={(e) => setSessionNote(e.target.value)}
        />
      </div>

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
          Oprav označené hodnoty — po ukončení sa už nedajú zmeniť.
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
                Nezapísal si žiadnu sériu. Tréning sa uloží bez hodnôt a doplniť ich už nepôjde.
              </p>
            ) : (
              <>
                <p className={styles.confirmBody}>
                  Zapíšeme dnešné série presne tak, ako si ich zadal. Ak si to ešte nedokončil, radšej pokračuj —
                  po ukončení sa už hodnoty nedajú meniť, tréning sa dá len pozrieť.
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
