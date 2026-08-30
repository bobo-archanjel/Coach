"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addDayAction, type ActionState } from "../actions";
import styles from "./builder.module.css";

const initialState: ActionState = { error: null };

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
