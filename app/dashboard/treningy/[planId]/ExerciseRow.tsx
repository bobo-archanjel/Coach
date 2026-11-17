"use client";

import { useTranslations } from "next-intl";
import { useState, useActionState, useEffect, useRef, useTransition } from "react";
import dynamic from "next/dynamic";
import {
  updateExerciseEntryAction,
  removeExerciseEntryAction,
  getExerciseDetailAction,
  type ActionState,
  type WorkoutExerciseEntry,
} from "../actions";
import type { ExerciseDetail, ExerciseLibraryRow } from "@/lib/exercises";
import { ExerciseThumb } from "@/app/components/ExerciseThumb";
import { RepsOrTimeField } from "@/app/components/RepsOrTimeField";
import { EXERCISE_NOTE_MAX } from "@/lib/workouts/exerciseNote";
import { focusAddExercise, isPendingEdit, onEntryEditRequest, takePendingEdit } from "@/app/components/pendingEntryEdit";
import type { SupersetPos } from "@/lib/workouts/superset";
import styles from "@/app/components/workoutBuilder.module.css";

const ExerciseDetailModal = dynamic(() =>
  import("@/app/components/ExerciseDetailModal").then((m) => m.ExerciseDetailModal),
);

const initialState: ActionState = { error: null };

const EditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M9.5 1.5 12.5 4.5 4.5 12.5H1.5V9.5L9.5 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M2.5 4h9M5.5 4V2.5h3V4M3.5 4l.5 8h6l.5-8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M2.5 7.5 6 4l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function ExerciseRow({
  entry,
  dayId,
  planId,
  library,
  isFirst = false,
  isLast = false,
  reorderPending = false,
  onMove,
  superset = null,
}: {
  entry: WorkoutExerciseEntry;
  dayId: string;
  planId: string;
  library: ExerciseLibraryRow[];
  isFirst?: boolean;
  isLast?: boolean;
  reorderPending?: boolean;
  onMove?: (direction: "up" | "down") => void;
  /** pozícia v supersérii (štítok A1, linka vľavo, pauza po kole) */
  superset?: SupersetPos | null;
}) {
  const t = useTranslations("plans.builder");
  // práve pridaný cvik sa otvorí rovno na úpravu (pridať a vyplniť v jednom kroku)
  const [justAdded, setJustAdded] = useState(() => isPendingEdit(entry.entry_id));
  const [editing, setEditing] = useState(justAdded);
  const formRef = useRef<HTMLFormElement>(null);
  const [updateState, updateAction, updatePending] = useActionState(updateExerciseEntryAction, initialState);
  const [removeState, removeAction, removePending] = useActionState(removeExerciseEntryAction, initialState);
  const wasPending = useRef(false);
  const [detail, setDetail] = useState<ExerciseDetail | null | undefined>(undefined);
  const [showDetail, setShowDetail] = useState(false);
  const [, startTransition] = useTransition();

  const libEntry = library.find((l) => l.id === entry.exercise_id) ?? null;

  const openDetail = () => {
    if (!entry.exercise_id) return;
    setShowDetail(true);
    setDetail(undefined);
    startTransition(async () => {
      const d = await getExerciseDetailAction(entry.exercise_id!);
      setDetail(d);
    });
  };

  useEffect(() => {
    if (justAdded) takePendingEdit(entry.entry_id);
    // len pri vzniku riadku
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () =>
      onEntryEditRequest((id) => {
        if (id === entry.entry_id && takePendingEdit(id)) {
          setJustAdded(true);
          setEditing(true);
        }
      }),
    [entry.entry_id],
  );

  // nový cvik: formulár do záberu a fokus na Série (vybrané, prepíše sa jedným ťukom)
  useEffect(() => {
    if (!editing || !justAdded) return;
    const form = formRef.current;
    form?.scrollIntoView({ block: "center", behavior: "smooth" });
    const sets = form?.querySelector<HTMLInputElement>('input[name="sets"]');
    sets?.focus({ preventScroll: true });
    sets?.select();
  }, [editing, justAdded]);

  useEffect(() => {
    if (wasPending.current && !updatePending && !updateState.error) {
      setEditing(false);
      if (justAdded) {
        setJustAdded(false);
        focusAddExercise();
      }
    }
    wasPending.current = updatePending;
  }, [updatePending, updateState.error, justAdded]);

  if (editing) {
    return (
      <form ref={formRef} action={updateAction} className={styles.editForm}>
        <input type="hidden" name="day_id" value={dayId} readOnly />
        <input type="hidden" name="plan_id" value={planId} readOnly />
        <input type="hidden" name="entry_id" value={entry.entry_id} readOnly />
        <span className={styles.editName}>{entry.exercise_name}</span>
        <div className={styles.editGrid}>
          <label className={`${styles.editField} ${styles.editFieldSets}`}>
            <span className={styles.editFieldLabel}>{t("sets")}</span>
            <input name="sets" type="number" min={1} defaultValue={entry.sets} required />
          </label>
          <RepsOrTimeField defaultValue={entry.reps ?? ""} className={styles.editFieldReps} />
          <label className={`${styles.editField} ${styles.editFieldLoad}`}>
            <span className={styles.editFieldLabel}>{t("load")}</span>
            <input name="load_kg" type="number" step="0.5" defaultValue={entry.load_kg ?? ""} placeholder="—" />
          </label>
          <label className={`${styles.editField} ${styles.editFieldRest}`}>
            <span className={styles.editFieldLabel}>{t("rest")}</span>
            <input name="rest_seconds" type="number" defaultValue={entry.rest_seconds ?? ""} placeholder="—" />
          </label>
          {/* pole „tempo“ v dátach = poznámka k cviku (lib/workouts/exerciseNote.ts) */}
          <label className={`${styles.editField} ${styles.editFieldNote}`}>
            <span className={styles.editFieldLabel}>{t("note")}</span>
            <input
              name="tempo"
              type="text"
              maxLength={EXERCISE_NOTE_MAX}
              defaultValue={entry.tempo ?? ""}
              placeholder={t("notePlaceholder")}
            />
          </label>
        </div>
        <div className={styles.editActions}>
          <button type="submit" className="btn btn-primary btn-sm" disabled={updatePending}>
            {updatePending ? t("saving") : t("save")}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setEditing(false);
              setJustAdded(false);
            }}
            disabled={updatePending}
          >
            {t("cancel")}
          </button>
        </div>
        {updateState.error && <p className={styles.formError}>{updateState.error}</p>}
      </form>
    );
  }

  return (
    <div className={`${styles.exerciseRow} ${superset ? styles.ssMember : ""}`} data-tour="plan-exercise" data-superset={superset ? `${superset.letter}${superset.index}` : undefined}>
      {entry.exercise_id ? (
        <button type="button" className={styles.exerciseNameBtn} onClick={openDetail}>
          {superset && <span className={styles.ssTag}>{`${superset.letter}${superset.index}`}</span>}
          <ExerciseThumb src={libEntry?.image_url[0] ?? null} alt="" size={26} />
          <span className={styles.exerciseName}>{entry.exercise_name}</span>
        </button>
      ) : (
        <div className={styles.exerciseNameStatic}>
          {superset && <span className={styles.ssTag}>{`${superset.letter}${superset.index}`}</span>}
          <ExerciseThumb src={null} alt="" size={26} />
          <span className={styles.exerciseName}>{entry.exercise_name}</span>
        </div>
      )}
      <span className={styles.exerciseSummary}>
        {entry.sets}× {entry.reps}
        {entry.load_kg ? ` @ ${entry.load_kg} kg` : ""}
      </span>
      {superset && !superset.last ? (
        // v supersérii sa medzi cvikmi nepauzuje — pauza až po kole (pauza posledného cviku)
        <span className={`${styles.exerciseMeta} ${styles.ssMeta}`}>
          {t("ssNext", { next: `${superset.letter}${superset.index + 1}` })}
        </span>
      ) : superset ? (
        <span className={`${styles.exerciseMeta} ${styles.ssMeta}`}>
          {entry.rest_seconds ? t("ssRoundRest", { seconds: entry.rest_seconds }) : t("ssRoundNoRest")}
        </span>
      ) : entry.rest_seconds ? (
        <span className={styles.exerciseMeta}>{t("restValue", { seconds: entry.rest_seconds })}</span>
      ) : null}
      {entry.tempo && <span className={styles.exerciseNote}>„{entry.tempo}“</span>}
      <div className={styles.rowActions}>
        {onMove && (
          <div className={styles.reorderBtns}>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => onMove("up")}
              disabled={isFirst || reorderPending}
              aria-label={t("moveUp")}
            >
              <ChevronIcon />
            </button>
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.reorderDown}`}
              onClick={() => onMove("down")}
              disabled={isLast || reorderPending}
              aria-label={t("moveDown")}
            >
              <ChevronIcon />
            </button>
          </div>
        )}
        <button type="button" className={styles.iconBtn} onClick={() => setEditing(true)} aria-label={t("editExercise")}>
          <EditIcon />
        </button>
        <form action={removeAction}>
          <input type="hidden" name="day_id" value={dayId} readOnly />
          <input type="hidden" name="plan_id" value={planId} readOnly />
          <input type="hidden" name="entry_id" value={entry.entry_id} readOnly />
          <button type="submit" className={`${styles.iconBtn} btn-danger`} disabled={removePending} aria-label={t("removeExercise")}>
            <TrashIcon />
          </button>
        </form>
      </div>
      {removeState.error && <p className={styles.formError}>{removeState.error}</p>}
      {showDetail && (
        <ExerciseDetailModal detail={detail} fallbackName={entry.exercise_name} onClose={() => setShowDetail(false)} />
      )}
    </div>
  );
}
