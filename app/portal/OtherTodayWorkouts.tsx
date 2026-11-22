"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { TodayOtherWorkout } from "@/lib/portal/types";
import { workoutStats } from "@/lib/workouts/completed";
import { DoneWorkoutView } from "./DoneWorkoutView";
import styles from "./portal.module.css";

/**
 * Ďalšie dnes odcvičené tréningy (klient odcvičil 2–3 dni plánu v jeden deň) — každý ako
 * samostatná karta pod kartou aktuálneho tréningu (nie vnorený v nej). Zbalená karta ukáže
 * názov a krátky súhrn; ťuk ju rozbalí na súhrn 2×2, cviky a „Upraviť hodnoty“
 * (DoneWorkoutView, rovnako ako hlavný tréning).
 */
export function OtherTodayWorkouts({ workouts }: { workouts: TodayOtherWorkout[] }) {
  const t = useTranslations("today");
  const [openId, setOpenId] = useState<string | null>(null);
  if (workouts.length === 0) return null;

  return (
    <>
      {workouts.map((w) => {
        const open = openId === w.logId;
        const stats = w.compare.exercises.length > 0 ? workoutStats(w.compare.exercises) : null;
        return (
          <section key={w.logId} className={styles.otherTodayCard} aria-label={w.title} data-testid="other-today">
            <button
              type="button"
              className={styles.otherTodayHead}
              onClick={() => setOpenId(open ? null : w.logId)}
              aria-expanded={open}
              aria-label={t(open ? "otherTodayHide" : "otherTodayShow", { name: w.title })}
            >
              <span className={styles.otherTodayText}>
                <span className={styles.otherTodayKicker}>{t("otherTodayKicker")}</span>
                <span className={styles.otherTodayName}>{w.title}</span>
                {stats && (
                  <span className={styles.otherTodayMeta}>
                    {t("otherTodayMeta", { done: stats.exercisesDone, total: stats.exercisesTotal, sets: stats.sets })}
                  </span>
                )}
              </span>
              <svg
                className={`${styles.otherTodayChevron} ${open ? styles.otherTodayChevronOpen : ""}`}
                width="20"
                height="20"
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
          </section>
        );
      })}
    </>
  );
}
