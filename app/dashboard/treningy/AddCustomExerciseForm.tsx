"use client";

import { useActionState } from "react";
import { addCustomExerciseAction, type ActionState } from "./actions";
import styles from "../dashboard.module.css";

const initialState: ActionState = { error: null };

export function AddCustomExerciseForm() {
  const [state, formAction, pending] = useActionState(addCustomExerciseAction, initialState);

  return (
    <form action={formAction} className={styles.addClientForm}>
      <div className={styles.addClientFields}>
        <input
          name="name"
          type="text"
          placeholder="Názov cviku"
          required
          disabled={pending}
          className={styles.addClientInput}
        />
        <input
          name="muscle_group"
          type="text"
          placeholder="Svalová partia (voliteľné)"
          disabled={pending}
          className={styles.addClientInput}
        />
        <button type="submit" className="btn btn-ghost btn-sm" disabled={pending}>
          {pending ? "Pridávam…" : "Pridať vlastný cvik"}
        </button>
      </div>
      {state.error && <p className={styles.addClientError}>{state.error}</p>}
    </form>
  );
}
