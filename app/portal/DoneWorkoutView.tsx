"use client";

import { useLocale, useTranslations } from "next-intl";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import { useState } from "react";
import type { LoggedExercise, LoggedSet, PortalExercise } from "@/lib/portal/types";
import {
  formatCompletedDate,
  formatDistance,
  formatDuration,
  formatEditDeadline,
  isStillEditable,
} from "@/lib/workouts/completed";
import { LoggedWorkoutEditor } from "./LoggedWorkoutEditor";
import styles from "./portal.module.css";

const LockIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const PencilIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4 20l1-4.2L15.6 5.2a1.5 1.5 0 0 1 2.1 0l1.1 1.1a1.5 1.5 0 0 1 0 2.1L8.2 19l-4.2 1Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

function setLabel(s: LoggedSet, repsLabel: (n: number) => string, locale: Locale): string {
  const parts: string[] = [];
  if (s.reps != null) parts.push(repsLabel(s.reps));
  if (s.weight != null) parts.push(`${s.weight.toLocaleString(intlLocale(locale))} kg`);
  if (s.durationS != null) parts.push(formatDuration(s.durationS));
  if (s.distanceM != null) parts.push(formatDistance(s.distanceM, locale));
  const base = parts.join(" × ") || "—";
  return s.rpe != null ? `${base} · RPE ${s.rpe}` : base;
}

/**
 * Dokončený tréning na karte Dnes — zapísané hodnoty. 24 h po ukončení ponúka
 * nefarebné "Upraviť hodnoty" (0049: klient zabudol sériu / preklep), potom je
 * záznam zamknutý v DB a ostane len na čítanie.
 */
export function DoneWorkoutView({
  loggedExercises,
  completedAt,
  sessionRpe,
  sessionNote,
  logId,
  editableUntil,
  exercises,
}: {
  loggedExercises: LoggedExercise[] | null;
  completedAt?: string | null;
  sessionRpe?: number | null;
  sessionNote?: string | null;
  logId?: string | null;
  editableUntil?: string | null;
  exercises: PortalExercise[];
}) {
  const t = useTranslations("workout");
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const canEdit = !!logId && isStillEditable(editableUntil);

  if (editing && canEdit && logId && editableUntil) {
    return (
      <LoggedWorkoutEditor
        logId={logId}
        exercises={exercises}
        logged={loggedExercises ?? []}
        rpe={sessionRpe ?? null}
        note={sessionNote ?? null}
        editableUntil={editableUntil}
        onClose={() => setEditing(false)}
      />
    );
  }

  return (
    <>
      {loggedExercises ? (
        <div className={styles.doneExercises}>
          {loggedExercises.map((ex, i) => (
            <div key={`${ex.entryId ?? "ex"}-${i}`} className={styles.doneExerciseRow}>
              <p className={styles.doneExerciseTitle}>{ex.name}</p>
              {ex.sets.length > 0 && (
                <ol className={styles.doneSetList}>
                  {ex.sets.map((s, j) => (
                    <li key={j}>{setLabel(s, (n) => t("reps", { reps: n }), locale)}</li>
                  ))}
                </ol>
              )}
              {ex.note && <p className={styles.doneNote}>„{ex.note}“</p>}
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.doneNoValues}>{t("noValues")}</p>
      )}

      {(sessionRpe != null || sessionNote) && (
        <p className={styles.doneNote}>
          {sessionRpe != null && t("rpeLine", { rpe: sessionRpe })}
          {sessionRpe != null && sessionNote && " · "}
          {sessionNote && <>„{sessionNote}“</>}
        </p>
      )}

      {canEdit && editableUntil ? (
        <>
          <button type="button" className={styles.editValuesBtn} onClick={() => setEditing(true)}>
            <PencilIcon /> {t("editValues")}
          </button>
          <p className={styles.lockNote}>{t("editUntil", { deadline: formatEditDeadline(editableUntil, undefined, locale) })}</p>
        </>
      ) : (
        <p className={styles.lockNote}>
          <LockIcon />{" "}
          {completedAt ? t("lockedOn", { date: formatCompletedDate(completedAt, locale) }) : t("locked")}
        </p>
      )}
    </>
  );
}
