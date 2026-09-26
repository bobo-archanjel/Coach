"use client";

import { useState, useTransition } from "react";
import { duplicateCompletedWorkoutAction } from "../../../../treningy/actions";
import styles from "./completed.module.css";

/** "Duplikovať ako nový tréning" — nová editovateľná kópia plánu, pôvodný tréning ostane zamknutý. */
export function DuplicateWorkoutButton({ logId, disabled }: { logId: string; disabled?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const duplicate = () => {
    setError(null);
    startTransition(async () => {
      const res = await duplicateCompletedWorkoutAction(logId);
      // Úspech → redirect do buildera vnútri akcie. Sem sa vrátime len pri chybe.
      if (res?.error) setError(res.error);
    });
  };

  return (
    <div className={styles.duplicateBox}>
      <button type="button" className="btn btn-primary btn-sm" onClick={duplicate} disabled={pending || disabled}>
        {pending ? "Vytváram kópiu…" : "Duplikovať ako nový tréning"}
      </button>
      {error && (
        <p className={styles.duplicateError} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
