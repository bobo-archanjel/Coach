"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { LoggedExercise, PortalExercise } from "@/lib/portal/types";
import { updateWorkoutLogAction, type ActionState } from "./actions";
import styles from "./portal.module.css";

const initialState: ActionState = { error: null };

const PencilIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4 20l1-4.2L15.6 5.2a1.5 1.5 0 0 1 2.1 0l1.1 1.1a1.5 1.5 0 0 1 0 2.1L8.2 19l-4.2 1Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
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

/** Predvyplní riadky sérií skutočne zadanými hodnotami — párovanie podľa entryId,
 * s fallbackom na poradie (index), keby entryId chýbal (starší/voľne pridaný cvik). */
function seedRows(exercises: PortalExercise[], logged: LoggedExercise[] | null): Record<number, SetRow[]> {
  return Object.fromEntries(
    exercises.map((ex, i) => {
      const match = (ex.entryId && logged?.find((l) => l.entryId === ex.entryId)) || logged?.[i] || null;
      const rows: SetRow[] =
        match && match.sets.length > 0
          ? match.sets.map((s) => ({
              reps: s.reps != null ? String(s.reps) : "",
              weight: s.weight != null ? String(s.weight) : "",
            }))
          : Array.from({ length: ex.plannedSets }, () => ({ reps: "", weight: "" }));
      return [i, rows];
    }),
  );
}

/**
 * Zobrazenie dokončeného dňa na karte Dnes — skutočne zadané hodnoty (pilulky),
 * plus "Upraviť hodnoty" pre prípad preklepu/zabudnutej váhy. Editácia nemení
 * "hotový" stav dňa (žiadne znovuotvorenie Začať/Ukončiť) — len prepíše obsah
 * workout_logs.entries cez updateWorkoutLogAction. Bez potvrdzovacieho okna
 * (na rozdiel od Ukončiť tréning) — tu ide o opravu, nie o nezvratný krok.
 */
export function DoneWorkoutView({
  dayId,
  exercises,
  loggedExercises,
}: {
  dayId: string;
  exercises: PortalExercise[];
  loggedExercises: LoggedExercise[] | null;
}) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<Record<number, SetRow[]>>({});
  const [state, formAction, pending] = useActionState(updateWorkoutLogAction, initialState);
  const wasPending = useRef(false);

  // Po úspešnom uložení (bez chyby) sa vráť na read-only pohľad — nové hodnoty
  // prídu cez revalidatePath("/portal") v props zhora.
  useEffect(() => {
    if (wasPending.current && !pending && !state.error) setEditing(false);
    wasPending.current = pending;
  }, [pending, state]);

  const startEdit = () => {
    setRows(seedRows(exercises, loggedExercises));
    setEditing(true);
  };

  if (!editing) {
    return (
      <>
        {loggedExercises ? (
          <div className={styles.doneExercises}>
            {loggedExercises.map((ex, i) => (
              <div key={`${ex.entryId ?? "ex"}-${i}`} className={styles.doneExerciseRow}>
                <p className={styles.doneExerciseTitle}>{ex.name}</p>
                <ol className={styles.doneSetList}>
                  {ex.sets.map((s, j) => (
                    <li key={j}>
                      {s.reps != null ? `${s.reps} op.` : "—"}
                      {s.weight != null ? ` × ${s.weight} kg` : ""}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        ) : (
          <ol className={styles.exList}>
            {exercises.map((ex, i) => (
              <li key={`${ex.idx}-${i}`} className={styles.exRow}>
                <span className={styles.exIdx}>{ex.idx}</span>
                <span className={styles.exBody}>
                  <span className={styles.exName}>{ex.name}</span>
                  <span className={styles.exMeta}>
                    {[ex.scheme, ex.rest && `pauza ${ex.rest}`, ex.tempo && `tempo ${ex.tempo}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {ex.load && <span className={styles.exLoad}>{ex.load}</span>}
              </li>
            ))}
          </ol>
        )}

        <button type="button" className={styles.editValuesBtn} onClick={startEdit}>
          <PencilIcon /> Upraviť hodnoty
        </button>
      </>
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

      <div className={styles.editActions}>
        <button type="button" className={styles.swBtnGhost} onClick={() => setEditing(false)} disabled={pending}>
          Zrušiť
        </button>
        <button type="submit" className={styles.swBtnPrimary} disabled={pending}>
          {pending ? "Ukladám…" : "Uložiť zmeny"}
        </button>
      </div>
      {state.error && (
        <p style={{ color: "var(--error)", fontSize: 12, marginTop: 8, textAlign: "center" }}>{state.error}</p>
      )}
    </form>
  );
}
