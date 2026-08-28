"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addDayAction, type ActionState } from "../actions";
import styles from "./builder.module.css";

const initialState: ActionState = { error: null };

const WEEKDAY_OPTIONS = [
  { value: 1, label: "Pondelok" },
  { value: 2, label: "Utorok" },
  { value: 3, label: "Streda" },
  { value: 4, label: "Štvrtok" },
  { value: 5, label: "Piatok" },
  { value: 6, label: "Sobota" },
  { value: 7, label: "Nedeľa" },
];

export function AddDayInline({ planId, nextDayNumber }: { planId: string; nextDayNumber: number }) {
  const [adding, setAdding] = useState(false);
  const [state, formAction, pending] = useActionState(addDayAction, initialState);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      setAdding(false);
    }
    wasPending.current = pending;
  }, [pending, state.error]);

  if (!adding) {
    return (
      <button type="button" className={styles.addDayTab} onClick={() => setAdding(true)}>
        + deň
      </button>
    );
  }

  return (
    <form action={formAction} className={styles.addDayForm}>
      <input type="hidden" name="plan_id" value={planId} readOnly />
      <input type="hidden" name="day_number" value={nextDayNumber} readOnly />
      <input
        name="name"
        type="text"
        placeholder={`Deň ${nextDayNumber} — Push`}
        required
        autoFocus
        disabled={pending}
        className={styles.addDayInput}
      />
      <select name="weekday" disabled={pending} className={styles.addDayInput} defaultValue="" aria-label="Deň v týždni">
        <option value="">Bez pevného dňa</option>
        {WEEKDAY_OPTIONS.map((w) => (
          <option key={w.value} value={w.value}>
            {w.label}
          </option>
        ))}
      </select>
      <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
        {pending ? "…" : "Pridať"}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(false)} disabled={pending}>
        Zrušiť
      </button>
      {state.error && <p className={styles.formError}>{state.error}</p>}
    </form>
  );
}
