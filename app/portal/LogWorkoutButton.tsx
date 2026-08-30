"use client";

import { useActionState, useEffect, useState } from "react";
import type { PortalExercise } from "@/lib/portal/types";
import { finishWorkoutAction, type ActionState } from "./actions";
import styles from "./portal.module.css";
import { isWorkoutStarted, markWorkoutStarted } from "./workoutSession";

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

/**
 * "Začať tréning" je lokálny prepínač, ktorý rozbalí formulár skutočných hodnôt
 * (Fáza B) — pre každý cvik toľko riadkov sérií, koľko plánuje builder, s možnosťou
 * pridať/odobrať. Pri "Ukončiť tréning" sa vyplnené riadky serializujú do skrytého
 * poľa a odošlú spolu s day_id; prázdne riadky (klient nič nezadal) sa v actions.ts
 * odfiltrujú. Po úspechu server zrevaliduje /portal a session.kind sa zmení na
 * "done" (viď lib/portal/data.ts), takže sa toto tlačidlo prestane zobrazovať samo.
 */
export function LogWorkoutButton({ dayId, exercises }: { dayId: string; exercises: PortalExercise[] }) {
  const [started, setStarted] = useState(false);
  const [rows, setRows] = useState<Record<number, SetRow[]>>(() =>
    Object.fromEntries(exercises.map((ex, i) => [i, initialRows(ex)])),
  );
  const [state, formAction, pending] = useActionState(finishWorkoutAction, initialState);

  // Prepnutie tabu v portáli remountuje túto kartu — obnov "tréning začatý" z
  // localStorage, nech sa formulár nezbalí len preto, že sa klient pozrel na Chat.
  useEffect(() => {
    if (isWorkoutStarted(dayId)) setStarted(true);
  }, [dayId]);

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
  const entriesPayload = exercises.map((ex, i) => ({
    entryId: ex.entryId,
    name: ex.name,
    sets: (rows[i] ?? [])
      .filter((r) => r.reps.trim() !== "" || r.weight.trim() !== "")
      .map((r) => ({
        reps: r.reps.trim() === "" ? null : Number(r.reps),
        weight: r.weight.trim() === "" ? null : Number(r.weight),
      })),
  }));

  return (
    <form action={formAction} className={styles.logForm}>
      <input type="hidden" name="day_id" value={dayId} readOnly />
      <input type="hidden" name="entries" value={JSON.stringify(entriesPayload)} readOnly />

      {exercises.map((ex, exIdx) => (
        <div key={`${ex.idx}-${exIdx}`} className={styles.logExercise}>
          <p className={styles.logExerciseName}>{ex.name}</p>
          <div className={styles.logRows}>
            {(rows[exIdx] ?? []).map((row, rowIdx) => (
              <div key={rowIdx} className={styles.setRow}>
                <span className={styles.setNum}>{rowIdx + 1}</span>
                <label className={styles.setField}>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder={ex.plannedReps ?? "op."}
                    value={row.reps}
                    onChange={(e) => updateRow(exIdx, rowIdx, "reps", e.target.value)}
                  />
                  <span>op.</span>
                </label>
                <label className={styles.setField}>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    placeholder="kg"
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
            ))}
          </div>
          <button type="button" className={styles.addSetBtn} onClick={() => addRow(exIdx)}>
            <PlusIcon /> Pridať sériu
          </button>
        </div>
      ))}

      <button type="submit" className={`btn btn-primary ${styles.startBtn}`} disabled={pending}>
        {pending ? "Ukladám…" : "Ukončiť tréning"}
      </button>
      {state.error && (
        <p style={{ color: "var(--error)", fontSize: 12, marginTop: 8, textAlign: "center" }}>{state.error}</p>
      )}
    </form>
  );
}
