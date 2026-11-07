"use client";

import type { LoggedExercise, PortalExercise } from "@/lib/portal/types";
import { parseReps, parseWeight, summarizeWorkoutForm, type SetDraftRow } from "@/lib/workouts/setInput";
import styles from "./portal.module.css";

/**
 * Polia zápisu tréningu (série, poznámka ku cviku, RPE, poznámka k tréningu) —
 * zdieľané formulárom "Ukončiť tréning" (LogWorkoutButton) aj "Upraviť hodnoty"
 * (LoggedWorkoutEditor, 24 h po ukončení, 0049), aby vyzerali a validovali rovnako.
 */

export type SetRow = SetDraftRow;

export interface WorkoutFormValues {
  rows: Record<number, SetRow[]>;
  /** index cviku → text; `undefined` = pole poznámky ešte nie je rozbalené */
  notes: Record<number, string | undefined>;
  rpe: string;
  sessionNote: string;
}

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

/** Váha z plánu ako placeholder ("60" / "62,5") — klient vidí, čo má dvíhať. */
function weightPlaceholder(kg: number | null): string {
  return kg != null ? kg.toLocaleString("sk-SK", { maximumFractionDigits: 2 }) : "kg";
}

const numToField = (n: number | null | undefined) =>
  n == null ? "" : n.toLocaleString("sk-SK", { maximumFractionDigits: 2, useGrouping: false });

/** Prázdne riadky podľa plánu buildera (koľko sérií plánuje tréner). */
export function emptyFormValues(exercises: PortalExercise[]): WorkoutFormValues {
  return {
    rows: Object.fromEntries(
      exercises.map((ex, i) => [i, Array.from({ length: ex.plannedSets }, () => ({ reps: "", weight: "" }))]),
    ),
    notes: {},
    rpe: "",
    sessionNote: "",
  };
}

/**
 * Predvyplnenie z uloženého záznamu pre "Upraviť hodnoty" — cviky podľa plánu dňa,
 * zapísané série spárované podľa entryId (fallback názov). Cvik bez zápisu dostane
 * prázdne riadky podľa plánu, nech sa dá dodatočne doplniť.
 */
export function formValuesFromLog(
  exercises: PortalExercise[],
  logged: LoggedExercise[],
  rpe: number | null,
  note: string | null,
): WorkoutFormValues {
  const base = emptyFormValues(exercises);
  const notes: Record<number, string | undefined> = {};
  exercises.forEach((ex, i) => {
    const match =
      (ex.entryId && logged.find((l) => l.entryId === ex.entryId)) ||
      logged.find((l) => l.name.toLowerCase() === ex.name.toLowerCase()) ||
      null;
    if (!match) return;
    if (match.sets.length > 0) {
      base.rows[i] = match.sets.map((s) => ({ reps: numToField(s.reps), weight: numToField(s.weight) }));
    }
    if (match.note) notes[i] = match.note;
  });
  return { rows: base.rows, notes, rpe: rpe != null ? String(rpe) : "", sessionNote: note ?? "" };
}

/** Série a poznámky na odoslanie (JSON pre finishWorkoutAction / updateWorkoutLogAction). */
export function buildEntriesPayload(exercises: PortalExercise[], values: WorkoutFormValues) {
  const summary = summarizeWorkoutForm(exercises.length, values.rows);
  const entries = exercises.map((ex, i) => ({
    entryId: ex.entryId,
    name: ex.name,
    note: values.notes[i]?.trim() || undefined,
    sets: summary.sets[i] ?? [],
  }));
  return { summary, entries };
}

export function WorkoutSetsFields({
  exercises,
  values,
  onChange,
  showInvalid,
}: {
  exercises: PortalExercise[];
  values: WorkoutFormValues;
  onChange: (next: WorkoutFormValues) => void;
  showInvalid: boolean;
}) {
  const { rows, notes, rpe, sessionNote } = values;
  const setRows = (next: Record<number, SetRow[]>) => onChange({ ...values, rows: next });

  const updateRow = (exIdx: number, rowIdx: number, field: keyof SetRow, value: string) => {
    const next = [...(rows[exIdx] ?? [])];
    next[rowIdx] = { ...next[rowIdx], [field]: value };
    setRows({ ...rows, [exIdx]: next });
  };
  const addRow = (exIdx: number) => setRows({ ...rows, [exIdx]: [...(rows[exIdx] ?? []), { reps: "", weight: "" }] });
  const removeRow = (exIdx: number, rowIdx: number) =>
    setRows({ ...rows, [exIdx]: (rows[exIdx] ?? []).filter((_, i) => i !== rowIdx) });

  return (
    <>
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
                onClick={() => onChange({ ...values, notes: { ...notes, [exIdx]: "" } })}
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
              onChange={(e) => onChange({ ...values, notes: { ...notes, [exIdx]: e.target.value } })}
            />
          )}
        </div>
      ))}

      <div className={styles.logSessionMeta}>
        <label className={styles.logRpeField}>
          <span>Náročnosť tréningu (RPE)</span>
          <select value={rpe} onChange={(e) => onChange({ ...values, rpe: e.target.value })}>
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
          onChange={(e) => onChange({ ...values, sessionNote: e.target.value })}
        />
      </div>
    </>
  );
}
