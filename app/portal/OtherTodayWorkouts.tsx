"use client";

import { useTranslations } from "next-intl";
import type { TodayOtherWorkout } from "@/lib/portal/types";
import { DoneWorkoutView } from "./DoneWorkoutView";
import styles from "./portal.module.css";

/**
 * Ďalšie dnes odcvičené tréningy (klient odcvičil 2–3 dni plánu v jeden deň) — každý ako
 * samostatná karta pod kartou aktuálneho tréningu (nie vnorený v nej). Karta ukáže názov a súhrn
 * (cviky / série / objem) hneď; cviky a „Upraviť hodnoty“ sa ukážu po „Zobraziť cviky“
 * (DoneWorkoutView so `startCollapsed`).
 */
export function OtherTodayWorkouts({
  workouts,
}: {
  workouts: TodayOtherWorkout[];
}) {
  const t = useTranslations("today");
  if (workouts.length === 0) return null;

  return (
    <>
      {workouts.map((w) => (
        <section
          key={w.logId}
          className={styles.otherTodayCard}
          aria-label={w.title}
          data-testid="other-today"
        >
          <div className={styles.otherTodayHead}>
            <span className={styles.otherTodayKicker}>
              {t("otherTodayKicker")}
            </span>
            <span className={styles.otherTodayName}>{w.title}</span>
          </div>
          <div className={styles.otherTodayBody}>
            <DoneWorkoutView
              loggedExercises={w.loggedExercises}
              compare={w.compare}
              completedAt={w.completedAt}
              sessionRpe={w.rpe}
              sessionNote={w.note}
              logId={w.logId}
              editableUntil={w.editableUntil}
              exercises={w.exercises}
              startCollapsed
            />
          </div>
        </section>
      ))}
    </>
  );
}
