"use client";

import { useMemo, useState, useActionState } from "react";
import { addCustomFoodAction, type ActionState } from "../actions";
import { FoodLibraryItem } from "./FoodLibraryItem";
import styles from "./builder.module.css";

const initialState: ActionState = { error: null };

const ChevronIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M3.5 5.5 7 9l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function FoodLibrary({
  foods,
  activeDayId,
  planId,
}: {
  foods: { id: string; name: string; kcal_100g: number; protein_100g: number; carbs_100g: number; fat_100g: number }[];
  activeDayId: string | null;
  planId: string;
}) {
  const [query, setQuery] = useState("");
  // Na mobile defaultne zbalené — tréner vidí plátno (aktívny deň) prvé.
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(addCustomFoodAction, initialState);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return foods;
    return foods.filter((f) => f.name.toLowerCase().includes(q));
  }, [foods, query]);

  return (
    <div className={styles.library}>
      <button
        type="button"
        className={styles.libraryToggle}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={styles.libraryHead}>Knižnica potravín ({foods.length})</span>
        <ChevronIcon className={`${styles.libraryChevron} ${open ? styles.libraryChevronOpen : ""}`} />
      </button>
      {!activeDayId && <p className={styles.libraryHint}>Vytvor deň vpravo, potom sem klikni na potravinu.</p>}

      <div className={`${styles.libraryBody} ${!open ? styles.collapsed : ""}`}>
        <input
          type="text"
          placeholder="Hľadať potravinu…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={styles.librarySearch}
        />

        <div className={styles.libraryList}>
          {filtered.length > 0 ? (
            filtered.map((food) => <FoodLibraryItem key={food.id} food={food} dayId={activeDayId} planId={planId} />)
          ) : (
            <p className={styles.libraryEmpty}>Žiadna potravina nezodpovedá hľadaniu.</p>
          )}
        </div>

        <form action={formAction} className={styles.customExerciseForm}>
          <input name="name" type="text" placeholder="Nová potravina" required disabled={pending} className={styles.customExerciseInput} />
          <div className={styles.customFoodMacros}>
            <input name="kcal_100g" type="number" min={0} step="1" placeholder="kcal/100g" required disabled={pending} className={styles.customExerciseInput} />
            <input name="protein_100g" type="number" min={0} step="0.1" placeholder="B g/100g" required disabled={pending} className={styles.customExerciseInput} />
            <input name="carbs_100g" type="number" min={0} step="0.1" placeholder="S g/100g" required disabled={pending} className={styles.customExerciseInput} />
            <input name="fat_100g" type="number" min={0} step="0.1" placeholder="T g/100g" required disabled={pending} className={styles.customExerciseInput} />
          </div>
          <button type="submit" className="btn btn-ghost btn-sm" disabled={pending}>
            {pending ? "Pridávam…" : "+ Pridať do knižnice"}
          </button>
          {state.error && <p className={styles.formError}>{state.error}</p>}
        </form>
      </div>
    </div>
  );
}
