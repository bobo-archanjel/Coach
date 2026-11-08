"use client";

import { useState, useTransition } from "react";
import { setClientActivePlanAction } from "../actions";
import styles from "../../dashboard.module.css";

/**
 * „Nastaviť ako aktívny“ pri zverejnenom pláne v detaile klienta — plán sa klientovi
 * ukáže na karte Dnes (0056). Po úspechu revalidácia prekreslí zoznam s odznakom „Aktívny“.
 */
export function ActivePlanButton({ clientId, planId, planName }: { clientId: string; planId: string; planName: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const setActive = () => {
    setError(null);
    startTransition(async () => {
      const res = await setClientActivePlanAction(clientId, planId);
      if (res.error) setError(res.error);
    });
  };

  return (
    <span className={styles.activePlanAction}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={setActive}
        disabled={pending}
        aria-label={`Nastaviť „${planName}“ ako aktívny plán klienta`}
      >
        {pending ? "Nastavujem…" : "Nastaviť ako aktívny"}
      </button>
      {error && (
        <span className={styles.publishError} role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
