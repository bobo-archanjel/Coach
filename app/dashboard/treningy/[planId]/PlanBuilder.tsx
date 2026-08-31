"use client";

import { useEffect, useState } from "react";
import { ExerciseLibrary } from "./ExerciseLibrary";
import { ExerciseRow } from "./ExerciseRow";
import { AddDayInline } from "./AddDayInline";
import type { WorkoutExerciseEntry } from "../actions";
import type { ExerciseLibraryRow } from "@/lib/exercises";
import styles from "./builder.module.css";

interface Day {
  id: string;
  day_number: number;
  name: string;
  exercises: WorkoutExerciseEntry[];
}

export function PlanBuilder({
  planId,
  days,
  library,
}: {
  planId: string;
  days: Day[];
  library: ExerciseLibraryRow[];
}) {
  const [activeDayId, setActiveDayId] = useState<string | null>(days[0]?.id ?? null);

  // Ak aktívny deň zmizol (napr. z iného tabu) alebo ešte nebol vybraný, spadni na prvý dostupný.
  useEffect(() => {
    if (days.length === 0) {
      if (activeDayId !== null) setActiveDayId(null);
      return;
    }
    if (!days.some((d) => d.id === activeDayId)) {
      setActiveDayId(days[0].id);
    }
  }, [days, activeDayId]);

  const activeDay = days.find((d) => d.id === activeDayId) ?? null;

  return (
    <div className={styles.builderGrid}>
      <ExerciseLibrary exercises={library} activeDayId={activeDay?.id ?? null} planId={planId} />

      <div className={styles.canvas}>
        <div className={styles.dayTabs}>
          {days.map((day) => (
            <button
              key={day.id}
              type="button"
              className={`${styles.dayTab} ${day.id === activeDayId ? styles.dayTabActive : ""}`}
              onClick={() => setActiveDayId(day.id)}
              aria-current={day.id === activeDayId ? "true" : undefined}
            >
              {day.name}
            </button>
          ))}
          <AddDayInline planId={planId} nextDayNumber={days.length + 1} />
        </div>

        <div className={styles.dayPanel}>
          {activeDay ? (
            activeDay.exercises.length > 0 ? (
              activeDay.exercises.map((entry) => (
                <ExerciseRow key={entry.entry_id} entry={entry} dayId={activeDay.id} planId={planId} library={library} />
              ))
            ) : (
              <p className={styles.emptyDay}>
                Zatiaľ žiadne cviky — klikni na cvik v knižnici vľavo, pridá sa sem s defaultnými
                hodnotami, ktoré si hneď upravíš.
              </p>
            )
          ) : (
            <p className={styles.emptyDay}>Vytvor prvý deň vyššie.</p>
          )}
        </div>
      </div>
    </div>
  );
}
