"use client";

import { useActionState } from "react";
import { addExerciseToDayAction, type ActionState } from "../actions";
import styles from "../../dashboard.module.css";

const initialState: ActionState = { error: null };

export function AddExerciseForm({
  dayId,
  planId,
  exercises,
}: {
  dayId: string;
  planId: string;
  exercises: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(addExerciseToDayAction, initialState);

  return (
    <form action={formAction} className={styles.addClientForm}>
      <input type="hidden" name="day_id" value={dayId} />
      <input type="hidden" name="plan_id" value={planId} />
      <div className={styles.addClientFields}>
        <select name="exercise_id" required disabled={pending} className={styles.addClientInput} defaultValue="">
          <option value="" disabled>
            Vyber cvik
          </option>
          {exercises.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.name}
            </option>
          ))}
        </select>
        <input name="sets" type="number" min={1} placeholder="Série" required disabled={pending} className={styles.addClientInput} style={{ flex: "0 1 90px" }} />
        <input name="reps" type="text" placeholder="Opakovania (napr. 8)" required disabled={pending} className={styles.addClientInput} style={{ flex: "0 1 150px" }} />
        <input name="load_kg" type="number" step="0.5" placeholder="Záťaž kg" disabled={pending} className={styles.addClientInput} style={{ flex: "0 1 110px" }} />
        <input name="tempo" type="text" placeholder="Tempo (voliteľné)" disabled={pending} className={styles.addClientInput} style={{ flex: "0 1 130px" }} />
        <input name="rest_seconds" type="number" placeholder="Pauza (s)" disabled={pending} className={styles.addClientInput} style={{ flex: "0 1 110px" }} />
        <button type="submit" className="btn btn-ghost btn-sm" disabled={pending}>
          {pending ? "Pridávam…" : "+ Cvik"}
        </button>
      </div>
      {state.error && <p className={styles.addClientError}>{state.error}</p>}
    </form>
  );
}
