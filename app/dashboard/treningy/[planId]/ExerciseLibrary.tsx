"use client";

import { useMemo, useState, useActionState } from "react";
import { addCustomExerciseAction, type ActionState } from "../actions";
import { LibraryItem } from "./LibraryItem";
import styles from "./builder.module.css";

const initialState: ActionState = { error: null };

export function ExerciseLibrary({
  exercises,
  activeDayId,
  planId,
}: {
  exercises: { id: string; name: string; muscle_group: string | null }[];
  activeDayId: string | null;
  planId: string;
}) {
  const [query, setQuery] = useState("");
  const [state, formAction, pending] = useActionState(addCustomExerciseAction, initialState);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return exercises;
    return exercises.filter(
      (ex) => ex.name.toLowerCase().includes(q) || ex.muscle_group?.toLowerCase().includes(q)
    );
  }, [exercises, query]);

  return (
    <div className={styles.library}>
      <div>
        <div className={styles.libraryHead}>Knižnica cvikov</div>
        {!activeDayId && <p className={styles.libraryHint}>Vytvor deň vpravo, potom sem klikni na cvik.</p>}
      </div>

      <input
        type="text"
        placeholder="Hľadať cvik…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className={styles.librarySearch}
      />

      <div className={styles.libraryList}>
        {filtered.length > 0 ? (
          filtered.map((ex) => <LibraryItem key={ex.id} exercise={ex} dayId={activeDayId} planId={planId} />)
        ) : (
          <p className={styles.libraryEmpty}>Žiadny cvik nezodpovedá hľadaniu.</p>
        )}
      </div>

      <form action={formAction} className={styles.customExerciseForm}>
        <input name="name" type="text" placeholder="Nový vlastný cvik" required disabled={pending} className={styles.customExerciseInput} />
        <input name="muscle_group" type="text" placeholder="Partia (voliteľné)" disabled={pending} className={styles.customExerciseInput} />
        <button type="submit" className="btn btn-ghost btn-sm" disabled={pending}>
          {pending ? "Pridávam…" : "+ Pridať do knižnice"}
        </button>
        {state.error && <p className={styles.formError}>{state.error}</p>}
      </form>
    </div>
  );
}
