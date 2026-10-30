"use client";

import { useActionState } from "react";
import { addCustomExerciseAction, type ActionState } from "./actions";
import dashboardModule from "../dashboard.module.css";
import { useSkinStyles } from "@/app/components/uiSkin";

const initialState: ActionState = { error: null };

export function AddCustomExerciseForm() {
  const styles = useSkinStyles("dashboard", dashboardModule);
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
