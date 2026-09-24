import type { LoggedExercise, LoggedSet } from "@/lib/portal/types";
import { formatCompletedDate, formatDistance, formatDuration } from "@/lib/workouts/completed";
import styles from "./portal.module.css";

const LockIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

function setLabel(s: LoggedSet): string {
  const parts: string[] = [];
  if (s.reps != null) parts.push(`${s.reps} op.`);
  if (s.weight != null) parts.push(`${s.weight} kg`);
  if (s.durationS != null) parts.push(formatDuration(s.durationS));
  if (s.distanceM != null) parts.push(formatDistance(s.distanceM));
  const base = parts.join(" × ") || "—";
  return s.rpe != null ? `${base} · RPE ${s.rpe}` : base;
}

/**
 * Dokončený tréning na karte Dnes — len na čítanie. Od 0048 je záznam po
 * "Ukončiť tréning" zamknutý v DB (trigger), takže tu už nie je "Upraviť
 * hodnoty": to, čo klient zapísal, je presne to, čo vidí tréner.
 */
export function DoneWorkoutView({
  loggedExercises,
  completedAt,
  sessionRpe,
  sessionNote,
}: {
  loggedExercises: LoggedExercise[] | null;
  completedAt?: string | null;
  sessionRpe?: number | null;
  sessionNote?: string | null;
}) {
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
                    <li key={j}>{setLabel(s)}</li>
                  ))}
                </ol>
              )}
              {ex.note && <p className={styles.doneNote}>„{ex.note}“</p>}
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.doneNoValues}>Tréning si ukončil bez zapísaných hodnôt.</p>
      )}

      {(sessionRpe != null || sessionNote) && (
        <p className={styles.doneNote}>
          {sessionRpe != null && <>Náročnosť: RPE {sessionRpe}</>}
          {sessionRpe != null && sessionNote && " · "}
          {sessionNote && <>„{sessionNote}“</>}
        </p>
      )}

      <p className={styles.lockNote}>
        <LockIcon /> Dokončený{completedAt ? ` – ${formatCompletedDate(completedAt)}` : ""}. Zapísané hodnoty sa už
        nedajú meniť.
      </p>
    </>
  );
}
