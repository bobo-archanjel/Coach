"use client";

import { useMemo, useState, useActionState } from "react";
import { addCustomExerciseAction, type ActionState } from "../actions";
import { LibraryItem } from "./LibraryItem";
import type { ExerciseLibraryRow } from "@/lib/exercises";
import styles from "./builder.module.css";

const initialState: ActionState = { error: null };

const ChevronIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M3.5 5.5 7 9l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function ExerciseLibrary({
  exercises,
  activeDayId,
  planId,
}: {
  exercises: ExerciseLibraryRow[];
  activeDayId: string | null;
  planId: string;
}) {
  const [query, setQuery] = useState("");
  // Na mobile defaultne zbalené (viď builderGrid poradie) — tréner vidí plátno prvé.
  // Nad 760px CSS `.collapsed` pravidlo neplatí, takže tento stav tam vizuálne nič nemení.
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(addCustomExerciseAction, initialState);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return exercises;
    return exercises.filter(
      (ex) =>
        ex.name.toLowerCase().includes(q) ||
        ex.name_sk?.toLowerCase().includes(q) ||
        ex.muscle_group?.toLowerCase().includes(q)
    );
  }, [exercises, query]);

  return (
    <div className={styles.library}>
      <button
        type="button"
        className={styles.libraryToggle}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={styles.libraryHead}>Knižnica cvikov ({exercises.length})</span>
        <ChevronIcon className={`${styles.libraryChevron} ${open ? styles.libraryChevronOpen : ""}`} />
      </button>
      {!activeDayId && <p className={styles.libraryHint}>Vytvor deň vpravo, potom sem klikni na cvik.</p>}

      <div className={`${styles.libraryBody} ${!open ? styles.collapsed : ""}`}>
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
    </div>
  );
}
