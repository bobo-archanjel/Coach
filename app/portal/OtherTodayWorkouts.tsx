"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { TodayOtherWorkout } from "@/lib/portal/types";
import { workoutStats } from "@/lib/workouts/completed";
import { DoneWorkoutView } from "./DoneWorkoutView";
import styles from "./portal.module.css";

/**
 * Ďalšie dnes odcvičené tréningy pod práve zobrazeným na karte Dnes (klient odcvičil 2–3
 * dni plánu v jeden deň). Každý zbalený riadok — názov a krátky súhrn; ťuk ho rozbalí na
 * súhrn 2×2, cviky a „Upraviť hodnoty“ (DoneWorkoutView, rovnako ako hlavný tréning).
 */
export function OtherTodayWorkouts({ workouts }: { workouts: TodayOtherWorkout[] }) {
  const t = useTranslations("today");
  const [openId, setOpenId] = useState<string | null>(null);
  if (workouts.length === 0) return null;

  return (
    <section className={styles.otherToday} aria-label={t("otherTodayTitle")} data-testid="other-today">
      <p className={styles.otherTodayTitle}>{t("otherTodayTitle")}</p>
      {workouts.map((w) => {
        const open = openId === w.logId;
        const stats = w.compare.exercises.length > 0 ? workoutStats(w.compare.exercises) : null;
        return (
          <div key={w.logId} className={styles.otherTodayItem}>
            <button
              type="button"
              className={styles.otherTodayHead}
              onClick={() => setOpenId(open ? null : w.logId)}
              aria-expanded={open}
              aria-label={t(open ? "otherTodayHide" : "otherTodayShow", { name: w.title })}
            >
              <span className={styles.otherTodayText}>
                <span className={styles.otherTodayName}>{w.title}</span>
                {stats && (
                  <span className={styles.otherTodayMeta}>
                    {t("otherTodayMeta", { done: stats.exercisesDone, total: stats.exercisesTotal, sets: stats.sets })}
                  </span>
                )}
              </span>
              <svg
                className={`${styles.otherTodayChevron} ${open ? styles.otherTodayChevronOpen : ""}`}
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {open && (
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
                />
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
