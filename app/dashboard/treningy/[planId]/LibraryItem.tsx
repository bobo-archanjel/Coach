"use client";

import { useActionState } from "react";
import { addExerciseToDayAction, type ActionState } from "../actions";
import styles from "./builder.module.css";

const initialState: ActionState = { error: null };

export function LibraryItem({
  exercise,
  dayId,
  planId,
}: {
  exercise: { id: string; name: string; muscle_group: string | null };
  dayId: string | null;
  planId: string;
}) {
  const [, formAction, pending] = useActionState(addExerciseToDayAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="exercise_id" value={exercise.id} readOnly />
      <input type="hidden" name="plan_id" value={planId} readOnly />
      <input type="hidden" name="day_id" value={dayId ?? ""} readOnly />
      <button type="submit" className={styles.libraryItem} disabled={pending || !dayId} title={!dayId ? "Najprv vytvor deň" : `Pridať ${exercise.name} do dňa`}>
        <span>{exercise.name}</span>
        {exercise.muscle_group && <span className={styles.libraryItemMuscle}>{exercise.muscle_group}</span>}
      </button>
    </form>
  );
}
