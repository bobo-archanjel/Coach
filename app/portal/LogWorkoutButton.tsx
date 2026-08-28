"use client";

import { useActionState, useState } from "react";
import { finishWorkoutAction, type ActionState } from "./actions";
import styles from "./portal.module.css";

const initialState: ActionState = { error: null };

const ArrowIcon = () => (
  <svg className={styles.startArrow} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * "Začať tréning" je len lokálny prepínač (cviky sú už vypísané na karte Dnes,
 * netreba nikam navigovať) — samotný zápis do workout_logs nastane až pri
 * "Ukončiť tréning". Po úspechu server zrevaliduje /portal a session.kind
 * sa zmení na "done" (viď lib/portal/data.ts), takže sa toto tlačidlo prestane
 * zobrazovať samo.
 */
export function LogWorkoutButton({ dayId }: { dayId: string }) {
  const [started, setStarted] = useState(false);
  const [state, formAction, pending] = useActionState(finishWorkoutAction, initialState);

  if (!started) {
    return (
      <button type="button" className={`btn btn-primary ${styles.startBtn}`} onClick={() => setStarted(true)}>
        Začať tréning
        <ArrowIcon />
      </button>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="day_id" value={dayId} readOnly />
      <button type="submit" className={`btn btn-primary ${styles.startBtn}`} disabled={pending}>
        {pending ? "Ukladám…" : "Ukončiť tréning"}
      </button>
      {state.error && (
        <p style={{ color: "var(--error)", fontSize: 12, marginTop: 8, textAlign: "center" }}>{state.error}</p>
      )}
    </form>
  );
}
