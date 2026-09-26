"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LoggedExercise, PortalExercise } from "@/lib/portal/types";
import { formatEditDeadline } from "@/lib/workouts/completed";
import { updateWorkoutLogAction } from "./actions";
import { WorkoutSetsFields, buildEntriesPayload, formValuesFromLog, type WorkoutFormValues } from "./WorkoutSetsFields";
import styles from "./portal.module.css";

/**
 * "Upraviť hodnoty" dokončeného tréningu — ten istý formulár ako pri ukončení,
 * predvyplnený uloženými hodnotami. Povolené 24 h po ukončení (0049); DB to
 * vynucuje, tu je termín len zobrazený. Používa karta Dnes (DoneWorkoutView)
 * aj sekcia Tréning pri odcvičenom dni.
 */
export function LoggedWorkoutEditor({
  logId,
  exercises,
  logged,
  rpe,
  note,
  editableUntil,
  onClose,
}: {
  logId: string;
  exercises: PortalExercise[];
  logged: LoggedExercise[];
  rpe: number | null;
  note: string | null;
  editableUntil: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState<WorkoutFormValues>(() => formValuesFromLog(exercises, logged, rpe, note));
  const [showInvalid, setShowInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const { summary, entries } = buildEntriesPayload(exercises, values);

  const save = () => {
    if (summary.invalidCount > 0) {
      setShowInvalid(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await updateWorkoutLogAction({
        logId,
        entries: JSON.stringify(entries),
        rpe: values.rpe,
        note: values.sessionNote,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
      onClose();
    });
  };

  return (
    <div className={styles.logForm}>
      <p className={styles.editDeadline}>Hodnoty môžeš upraviť do {formatEditDeadline(editableUntil)}.</p>

      <WorkoutSetsFields exercises={exercises} values={values} onChange={setValues} showInvalid={showInvalid} />

      <div className={styles.editActions}>
        <button type="button" className={styles.swBtnGhost} onClick={onClose} disabled={pending}>
          Zrušiť
        </button>
        <button type="button" className={styles.swBtnPrimary} onClick={save} disabled={pending}>
          {pending ? "Ukladám…" : "Uložiť zmeny"}
        </button>
      </div>
      {showInvalid && summary.invalidCount > 0 && (
        <p role="alert" className={styles.editError}>
          Oprav označené hodnoty.
        </p>
      )}
      {error && <p className={styles.editError}>{error}</p>}
    </div>
  );
}
