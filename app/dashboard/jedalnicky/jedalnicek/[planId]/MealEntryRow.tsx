"use client";

import { useState } from "react";
import type { MealEntry } from "../actions";
import { MEAL_SLOT_LABELS, MEAL_SLOT_ORDER, scaleFoodMacros, type MealSlot } from "@/lib/meals";
import { MacroChips } from "./MacroChips";
import mealBuilderModule from "./builder.module.css";
import { useSkinStyles } from "@/app/components/uiSkin";

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

/** Položka dňa — úprava aj odstránenie len lokálne, do DB ide cez „Uložiť zmeny". */
export function MealEntryRow({
  entry,
  onUpdate,
  onRemove,
}: {
  entry: MealEntry;
  onUpdate: (patch: { meal_slot: MealSlot; grams: number }) => void;
  onRemove: () => void;
}) {
  const styles = useSkinStyles("mealBuilder", mealBuilderModule);
  const [editing, setEditing] = useState(false);
  const [slot, setSlot] = useState<MealSlot>(entry.meal_slot);
  const [grams, setGrams] = useState(String(entry.grams));
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setSlot(entry.meal_slot);
    setGrams(String(entry.grams));
    setError(null);
    setEditing(true);
  };

  const apply = () => {
    const g = Number(grams.replace(",", "."));
    if (!Number.isFinite(g) || g <= 0 || g > 5000) {
      setError("Zadaj gramáž 1–5000 g.");
      return;
    }
    onUpdate({ meal_slot: slot, grams: Math.round(g * 10) / 10 });
    setEditing(false);
  };

  const macros = scaleFoodMacros(entry, entry.grams);

  if (editing) {
    return (
      <form
        className={styles.editForm}
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <span className={styles.editName}>{entry.food_name}</span>
        <div className={styles.editGrid}>
          <label className={`${styles.editField} ${styles.editFieldSlot}`}>
            <span className={styles.editFieldLabel}>Jedlo dňa</span>
            <select value={slot} onChange={(e) => setSlot(e.target.value as MealSlot)}>
              {MEAL_SLOT_ORDER.map((s) => (
                <option key={s} value={s}>
                  {MEAL_SLOT_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className={`${styles.editField} ${styles.editFieldGrams}`}>
            <span className={styles.editFieldLabel}>Gramáž (g)</span>
            <input
              type="text"
              inputMode="decimal"
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
              autoFocus
            />
          </label>
        </div>
        <div className={styles.editActions}>
          <button type="submit" className="btn btn-primary btn-sm">
            Hotovo
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
            Zrušiť
          </button>
        </div>
        {error && <p className={styles.formError}>{error}</p>}
      </form>
    );
  }

  return (
    <div className={styles.exerciseRow}>
      <span className={styles.exerciseName}>{entry.food_name}</span>
      <span className={styles.exerciseSummary}>
        {entry.grams} g · {macros.kcal} kcal
      </span>
      <MacroChips proteinG={macros.proteinG} carbsG={macros.carbsG} fatG={macros.fatG} />
      <div className={styles.rowActions}>
        <button type="button" className={styles.iconBtn} onClick={startEdit} aria-label="Upraviť položku">
          <EditIcon />
        </button>
        <button type="button" className={`${styles.iconBtn} btn-danger`} onClick={onRemove} aria-label="Odstrániť položku">
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}
