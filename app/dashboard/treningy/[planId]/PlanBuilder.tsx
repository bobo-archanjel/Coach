"use client";

import { useEffect, useState, useTransition } from "react";
import { ExerciseLibrary } from "./ExerciseLibrary";
import { ExerciseRow } from "./ExerciseRow";
import { AddDayInline } from "./AddDayInline";
import { moveExerciseEntryAction, type WorkoutExerciseEntry } from "../actions";
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

  // Lokálna kópia dní kvôli optimistickému presunu poradia cvikov — po revalidácii
  // sa zosúladí so serverovou pravdou (nový `days` prop pri každom refetchi).
  const [localDays, setLocalDays] = useState(days);
  useEffect(() => setLocalDays(days), [days]);
  const [reorderPending, startReorder] = useTransition();

  // Ak aktívny deň zmizol (napr. z iného tabu) alebo ešte nebol vybraný, spadni na prvý dostupný.
  useEffect(() => {
    if (localDays.length === 0) {
      if (activeDayId !== null) setActiveDayId(null);
      return;
    }
    if (!localDays.some((d) => d.id === activeDayId)) {
      setActiveDayId(localDays[0].id);
    }
  }, [localDays, activeDayId]);

  const activeDay = localDays.find((d) => d.id === activeDayId) ?? null;

  const moveExercise = (dayId: string, entryId: string, direction: "up" | "down") => {
    setLocalDays((prev) =>
      prev.map((d) => {
        if (d.id !== dayId) return d;
        const i = d.exercises.findIndex((e) => e.entry_id === entryId);
        const j = direction === "up" ? i - 1 : i + 1;
        if (i < 0 || j < 0 || j >= d.exercises.length) return d;
        const exercises = [...d.exercises];
        [exercises[i], exercises[j]] = [exercises[j], exercises[i]];
        return { ...d, exercises };
      }),
    );
    startReorder(async () => {
      await moveExerciseEntryAction({ planId, dayId, entryId, direction });
    });
  };

  return (
    <div className={styles.builderGrid}>
      <ExerciseLibrary exercises={library} activeDayId={activeDay?.id ?? null} planId={planId} />

      <div className={styles.canvas}>
        <div className={styles.dayTabs}>
          {localDays.map((day) => (
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
          <AddDayInline planId={planId} nextDayNumber={localDays.length + 1} />
        </div>

        <div className={styles.dayPanel}>
          {activeDay ? (
            activeDay.exercises.length > 0 ? (
              activeDay.exercises.map((entry, i) => (
                <ExerciseRow
                  key={entry.entry_id}
                  entry={entry}
                  dayId={activeDay.id}
                  planId={planId}
                  library={library}
                  isFirst={i === 0}
                  isLast={i === activeDay.exercises.length - 1}
                  reorderPending={reorderPending}
                  onMove={(direction) => moveExercise(activeDay.id, entry.entry_id, direction)}
                />
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
