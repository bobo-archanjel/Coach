"use client";

import { useActionState, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { addExerciseToDayAction, getExerciseDetailAction, type ActionState } from "../actions";
import { displayExerciseName, type ExerciseDetail, type ExerciseLibraryRow } from "@/lib/exercises";
import { ExerciseThumb } from "@/app/components/ExerciseThumb";
import styles from "./builder.module.css";

const ExerciseDetailModal = dynamic(() =>
  import("@/app/components/ExerciseDetailModal").then((m) => m.ExerciseDetailModal),
);

const initialState: ActionState = { error: null };

const InfoIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.4" />
    <path d="M8 7.3v4M8 5.2v.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

export function LibraryItem({
  exercise,
  dayId,
  planId,
}: {
  exercise: ExerciseLibraryRow;
  dayId: string | null;
  planId: string;
}) {
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
        <button type="submit" className={styles.libraryItem} disabled={pending || !dayId} title={!dayId ? "Najprv vytvor deň" : `Pridať ${name} do dňa`}>
          <ExerciseThumb src={exercise.image_url[0] ?? null} alt="" size={28} />
          <span>{name}</span>
          {exercise.muscle_group && <span className={styles.libraryItemMuscle}>{exercise.muscle_group}</span>}
        </button>
      </form>
      <button type="button" className={styles.libraryItemInfo} onClick={openDetail} aria-label={`Detail cviku ${name}`}>
        <InfoIcon />
      </button>
      {showDetail && (
        <ExerciseDetailModal detail={detail} fallbackName={name} onClose={() => setShowDetail(false)} />
      )}
    </div>
  );
}
