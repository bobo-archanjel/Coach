"use client";

import { useState, useActionState, useEffect, useRef } from "react";
import { updateExerciseEntryAction, removeExerciseEntryAction, type ActionState, type WorkoutExerciseEntry } from "../actions";
import styles from "./builder.module.css";

const initialState: ActionState = { error: null };

const EditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M9.5 1.5 12.5 4.5 4.5 12.5H1.5V9.5L9.5 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M2.5 4h9M5.5 4V2.5h3V4M3.5 4l.5 8h6l.5-8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function ExerciseRow({ entry, dayId, planId }: { entry: WorkoutExerciseEntry; dayId: string; planId: string }) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction, updatePending] = useActionState(updateExerciseEntryAction, initialState);
  const [removeState, removeAction, removePending] = useActionState(removeExerciseEntryAction, initialState);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !updatePending && !updateState.error) {
      setEditing(false);
    }
    wasPending.current = updatePending;
  }, [updatePending, updateState.error]);

  if (editing) {
    return (
      <form action={updateAction} className={styles.editForm}>
        <input type="hidden" name="day_id" value={dayId} readOnly />
        <input type="hidden" name="plan_id" value={planId} readOnly />
        <input type="hidden" name="entry_id" value={entry.entry_id} readOnly />
        <span className={styles.editName}>{entry.exercise_name}</span>
        <div className={styles.editGrid}>
          <label className={`${styles.editField} ${styles.editFieldSets}`}>
            <span className={styles.editFieldLabel}>Série</span>
            <input name="sets" type="number" min={1} defaultValue={entry.sets} required />
          </label>
          <label className={`${styles.editField} ${styles.editFieldReps}`}>
            <span className={styles.editFieldLabel}>Opakovania</span>
            <input name="reps" type="text" defaultValue={entry.reps} required />
          </label>
          <label className={`${styles.editField} ${styles.editFieldLoad}`}>
            <span className={styles.editFieldLabel}>Záťaž (kg)</span>
            <input name="load_kg" type="number" step="0.5" defaultValue={entry.load_kg ?? ""} placeholder="—" />
          </label>
          <label className={`${styles.editField} ${styles.editFieldTempo}`}>
            <span className={styles.editFieldLabel}>Tempo</span>
            <input name="tempo" type="text" defaultValue={entry.tempo ?? ""} placeholder="—" />
          </label>
          <label className={`${styles.editField} ${styles.editFieldRest}`}>
            <span className={styles.editFieldLabel}>Pauza (s)</span>
            <input name="rest_seconds" type="number" defaultValue={entry.rest_seconds ?? ""} placeholder="—" />
          </label>
        </div>
        <div className={styles.editActions}>
          <button type="submit" className="btn btn-primary btn-sm" disabled={updatePending}>
            {updatePending ? "Ukladám…" : "Uložiť"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)} disabled={updatePending}>
            Zrušiť
          </button>
        </div>
        {updateState.error && <p className={styles.formError}>{updateState.error}</p>}
      </form>
    );
  }

  return (
    <div className={styles.exerciseRow}>
      <span className={styles.exerciseName}>{entry.exercise_name}</span>
      <span className={styles.exerciseSummary}>
        {entry.sets}× {entry.reps}
        {entry.load_kg ? ` @ ${entry.load_kg} kg` : ""}
      </span>
      <span className={styles.exerciseMeta}>
        {entry.tempo ? `tempo ${entry.tempo}` : ""}
        {entry.tempo && entry.rest_seconds ? " · " : ""}
        {entry.rest_seconds ? `pauza ${entry.rest_seconds}s` : ""}
      </span>
      <div className={styles.rowActions}>
        <button type="button" className={styles.iconBtn} onClick={() => setEditing(true)} aria-label="Upraviť cvik">
          <EditIcon />
        </button>
        <form action={removeAction}>
          <input type="hidden" name="day_id" value={dayId} readOnly />
          <input type="hidden" name="plan_id" value={planId} readOnly />
          <input type="hidden" name="entry_id" value={entry.entry_id} readOnly />
          <button type="submit" className={styles.iconBtn} disabled={removePending} aria-label="Odstrániť cvik">
            <TrashIcon />
          </button>
        </form>
      </div>
      {removeState.error && <p className={styles.formError}>{removeState.error}</p>}
    </div>
  );
}
