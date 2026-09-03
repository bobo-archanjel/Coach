"use client";

import { useEffect, useMemo, useState, useActionState } from "react";
import { addCustomExerciseAction, type ActionState } from "../actions";
import { LibraryItem } from "./LibraryItem";
import type { ExerciseLibraryRow } from "@/lib/exercises";
import styles from "./builder.module.css";

const initialState: ActionState = { error: null };
const PAGE_SIZE = 7;

const ChevronIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M3.5 5.5 7 9l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ArrowIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M5.5 3l3.5 4-3.5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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
  const [page, setPage] = useState(0);

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

  // Nová hľadaná fráza mení výsledky pod nohami stránkovania — späť na prvú stranu.
  useEffect(() => {
    setPage(0);
  }, [query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

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
        <form action={formAction} className={styles.customExerciseForm}>
          <input name="name" type="text" placeholder="Nový vlastný cvik" required disabled={pending} className={styles.customExerciseInput} />
          <input name="muscle_group" type="text" placeholder="Partia (voliteľné)" disabled={pending} className={styles.customExerciseInput} />
          <button type="submit" className="btn btn-ghost btn-sm" disabled={pending}>
            {pending ? "Pridávam…" : "+ Pridať do knižnice"}
          </button>
          {state.error && <p className={styles.formError}>{state.error}</p>}
        </form>

        <input
          type="text"
          placeholder="Hľadať cvik…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={styles.librarySearch}
        />

        <div className={styles.libraryList}>
          {paged.length > 0 ? (
            paged.map((ex) => <LibraryItem key={ex.id} exercise={ex} dayId={activeDayId} planId={planId} />)
          ) : (
            <p className={styles.libraryEmpty}>Žiadny cvik nezodpovedá hľadaniu.</p>
          )}
        </div>

        {pageCount > 1 && (
          <div className={styles.libraryPager}>
            <button
              type="button"
              className={styles.libraryPagerBtn}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              aria-label="Predchádzajúca strana"
            >
              <ArrowIcon className={styles.libraryPagerPrev} />
            </button>
            <span className={styles.libraryPagerLabel}>
              {safePage + 1} / {pageCount}
            </span>
            <button
              type="button"
              className={styles.libraryPagerBtn}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage === pageCount - 1}
              aria-label="Ďalšia strana"
            >
              <ArrowIcon />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
