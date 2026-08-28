"use client";

import { useState, useActionState, useEffect, useRef } from "react";
import { updateMealEntryAction, removeMealEntryAction, type ActionState, type MealEntry } from "../actions";
import { MEAL_SLOT_LABELS, MEAL_SLOT_ORDER, scaleFoodMacros } from "@/lib/meals";
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

export function MealEntryRow({ entry, dayId, planId }: { entry: MealEntry; dayId: string; planId: string }) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction, updatePending] = useActionState(updateMealEntryAction, initialState);
  const [removeState, removeAction, removePending] = useActionState(removeMealEntryAction, initialState);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !updatePending && !updateState.error) {
      setEditing(false);
    }
    wasPending.current = updatePending;
  }, [updatePending, updateState.error]);

  const macros = scaleFoodMacros(entry, entry.grams);

  if (editing) {
    return (
      <form action={updateAction} className={styles.editForm}>
        <input type="hidden" name="day_id" value={dayId} readOnly />
        <input type="hidden" name="plan_id" value={planId} readOnly />
        <input type="hidden" name="entry_id" value={entry.entry_id} readOnly />
        <span className={styles.editName}>{entry.food_name}</span>
        <div className={styles.editGrid}>
          <label className={`${styles.editField} ${styles.editFieldSlot}`}>
            <span className={styles.editFieldLabel}>Jedlo dňa</span>
            <select name="meal_slot" defaultValue={entry.meal_slot}>
              {MEAL_SLOT_ORDER.map((slot) => (
                <option key={slot} value={slot}>
                  {MEAL_SLOT_LABELS[slot]}
                </option>
              ))}
            </select>
          </label>
          <label className={`${styles.editField} ${styles.editFieldGrams}`}>
            <span className={styles.editFieldLabel}>Gramáž (g)</span>
            <input name="grams" type="number" min={1} step="1" defaultValue={entry.grams} required />
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
      <span className={styles.exerciseName}>{entry.food_name}</span>
      <span className={styles.exerciseSummary}>
        {entry.grams} g · {macros.kcal} kcal
      </span>
      <span className={styles.exerciseMeta}>
        {macros.proteinG}g B · {macros.carbsG}g S · {macros.fatG}g T
      </span>
      <div className={styles.rowActions}>
        <button type="button" className={styles.iconBtn} onClick={() => setEditing(true)} aria-label="Upraviť položku">
          <EditIcon />
        </button>
        <form action={removeAction}>
          <input type="hidden" name="day_id" value={dayId} readOnly />
          <input type="hidden" name="plan_id" value={planId} readOnly />
          <input type="hidden" name="entry_id" value={entry.entry_id} readOnly />
          <button type="submit" className={styles.iconBtn} disabled={removePending} aria-label="Odstrániť položku">
            <TrashIcon />
          </button>
        </form>
      </div>
      {removeState.error && <p className={styles.formError}>{removeState.error}</p>}
    </div>
  );
}
