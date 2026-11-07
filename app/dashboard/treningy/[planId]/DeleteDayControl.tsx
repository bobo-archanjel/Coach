"use client";

import { useEffect, useState, useTransition } from "react";
import { deleteDayAction } from "../actions";
import styles from "./builder.module.css";

function exercisesLabel(n: number): string {
  if (n === 0) return "";
  return n === 1 ? " aj s 1 cvikom" : ` aj s ${n} cvikmi`;
}

/**
 * "Zmazať deň" vedľa "+ deň" — zmaže práve zvolený deň. Dvojkrokové inline
 * potvrdenie (rovnaký vzor ako "Zmazať koncept" v PublishControl), aby náhodný
 * klik nič nezmazal. Esc = zrušiť. Rodič ho kľúčuje podľa dňa, takže prepnutie
 * dňa rozpracované potvrdenie zahodí.
 */
export function DeleteDayControl({
  planId,
  dayId,
  dayName,
  exerciseCount,
  hasCompleted,
}: {
  planId: string;
  dayId: string;
  dayName: string;
  exerciseCount: number;
  /** klient už tento deň odcvičil — ukážeme, že jeho záznamy ostanú */
  hasCompleted: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!confirming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) setConfirming(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming, pending]);

  const doDelete = () => {
    setError(null);
    startTransition(async () => {
      const res = await deleteDayAction(planId, dayId);
      if (res.error) setError(res.error);
      // Úspech → revalidácia pošle nové `days`, PlanBuilder prepne na prvý zostávajúci deň.
    });
  };

  if (!confirming) {
    return (
      <button type="button" className={styles.deleteDayTab} onClick={() => setConfirming(true)}>
        Zmazať deň
      </button>
    );
  }

  return (
    <div className={styles.deleteDayConfirm} role="alertdialog" aria-labelledby={`delete-day-${dayId}`}>
      <p id={`delete-day-${dayId}`} className={styles.deleteDayQuestion}>
        Naozaj zmazať deň „{dayName}“{exercisesLabel(exerciseCount)}? Nedá sa to vrátiť späť.
        {hasCompleted && " Tréningy, ktoré klient z tohto dňa už odcvičil, ostanú uložené."}
      </p>
      <div className={styles.deleteDayActions}>
        <button type="button" className="btn btn-primary btn-sm" onClick={doDelete} disabled={pending}>
          {pending ? "Mažem…" : "Áno, zmazať deň"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)} disabled={pending}>
          Zrušiť
        </button>
      </div>
      {error && <p className={styles.formError}>{error}</p>}
    </div>
  );
}
