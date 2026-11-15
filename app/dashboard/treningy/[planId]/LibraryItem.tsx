"use client";

import { useLocale } from "next-intl";
import { muscleGroupLabel } from "@/lib/i18n/muscles";
import { useTranslations } from "next-intl";
import { useActionState, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { addExerciseToDayAction, getExerciseDetailAction, type ActionState } from "../actions";
import { displayExerciseName, type ExerciseDetail, type ExerciseLibraryRow } from "@/lib/exercises";
import { ExerciseThumb } from "@/app/components/ExerciseThumb";
import styles from "@/app/components/workoutBuilder.module.css";

const ExerciseDetailModal = dynamic(() =>
  import("@/app/components/ExerciseDetailModal").then((m) => m.ExerciseDetailModal),
);

const initialState: ActionState = { error: null };

const InfoIcon = () => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M8 7.2v4.3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    <circle cx="8" cy="4.6" r="1.15" fill="currentColor" />
  </svg>
);

export function LibraryItem({
  exercise,
  dayId,
  planId,
  onNoDay,
}: {
  exercise: ExerciseLibraryRow;
  dayId: string | null;
  planId: string;
  /** klik bez vytvoreného dňa — rodič ukáže hlášku (namiesto mŕtveho, neaktívneho tlačidla) */
  onNoDay?: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations("plans.builder");
  const [, formAction, pending] = useActionState(addExerciseToDayAction, initialState);
  const [detail, setDetail] = useState<ExerciseDetail | null | undefined>(undefined);
  const [showDetail, setShowDetail] = useState(false);
  const [, startTransition] = useTransition();

  const name = displayExerciseName(exercise.name, exercise.name_sk);

  const openDetail = () => {
    setShowDetail(true);
    setDetail(undefined);
    startTransition(async () => {
      const d = await getExerciseDetailAction(exercise.id);
      setDetail(d);
    });
  };

  return (
    <div className={styles.libraryItemRow}>
      <form action={formAction} className={styles.libraryItemForm}>
        <input type="hidden" name="exercise_id" value={exercise.id} readOnly />
        <input type="hidden" name="plan_id" value={planId} readOnly />
        <input type="hidden" name="day_id" value={dayId ?? ""} readOnly />
        <button
          type="submit"
          className={styles.libraryItem}
          disabled={pending}
          title={!dayId ? t("addDayFirst") : t("addToDay", { name })}
          onClick={(e) => {
            if (!dayId) {
              e.preventDefault();
              onNoDay?.();
            }
          }}
        >
          <ExerciseThumb src={exercise.image_url[0] ?? null} alt="" size={28} />
          <span className={styles.libraryItemName}>{name}</span>
          {exercise.muscle_group && (
            <span className={styles.libraryItemMuscle} title={muscleGroupLabel(exercise.muscle_group, locale)}>
              {muscleGroupLabel(exercise.muscle_group, locale)}
            </span>
          )}
        </button>
      </form>
      <button type="button" className={styles.libraryItemInfo} onClick={openDetail} aria-label={t("exerciseDetail", { name })}>
        <InfoIcon />
      </button>
      {showDetail && (
        <ExerciseDetailModal detail={detail} fallbackName={name} onClose={() => setShowDetail(false)} />
      )}
    </div>
  );
}
