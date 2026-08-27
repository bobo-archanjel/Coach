"use client";

import { useActionState } from "react";
import { addDayAction, type ActionState } from "../actions";
import styles from "../../dashboard.module.css";

const initialState: ActionState = { error: null };

export function AddDayForm({ planId, nextDayNumber }: { planId: string; nextDayNumber: number }) {
  const [state, formAction, pending] = useActionState(addDayAction, initialState);

  return (
    <form action={formAction} className={styles.addClientForm}>
      <input type="hidden" name="plan_id" value={planId} />
      <input type="hidden" name="day_number" value={nextDayNumber} />
      <div className={styles.addClientFields}>
        <input
          name="name"
          type="text"
          placeholder={`Názov dňa (napr. Deň ${nextDayNumber} — Push)`}
          required
          disabled={pending}
          className={styles.addClientInput}
        />
        <button type="submit" className="btn btn-ghost btn-sm" disabled={pending}>
          {pending ? "Pridávam…" : "+ Pridať deň"}
        </button>
      </div>
      {state.error && <p className={styles.addClientError}>{state.error}</p>}
    </form>
  );
}
