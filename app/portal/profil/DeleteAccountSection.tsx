"use client";

import { useState, useTransition } from "react";
import { cancelOwnDeletionAction, requestOwnDeletionAction } from "../actions";
import styles from "../portal.module.css";

const GRACE_DAYS = 30;

function daysLeft(requestedAt: string): number {
  const deadline = new Date(requestedAt).getTime() + GRACE_DAYS * 24 * 3600_000;
  return Math.max(0, Math.ceil((deadline - Date.now()) / (24 * 3600_000)));
}

function daysLabel(n: number): string {
  if (n === 1) return "1 deň";
  if (n >= 2 && n <= 4) return `${n} dni`;
  return `${n} dní`;
}

export function DeleteAccountSection({
  requestedAt,
  requestedBy,
}: {
  requestedAt: string | null;
  requestedBy: "trainer" | "client" | null;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const request = () => {
    startTransition(async () => {
      const res = await requestOwnDeletionAction();
      if (res.error) setError(res.error);
      else setConfirming(false);
    });
  };

  const cancel = () => {
    startTransition(async () => {
      const res = await cancelOwnDeletionAction();
      if (res.error) setError(res.error);
    });
  };

  return (
    <div className={styles.panel}>
      <p className={styles.panelLabel}>Zmazanie dát</p>
      {requestedAt ? (
        <>
          <p className={styles.dzText}>
            {requestedBy === "trainer" ? "Tréner požiadal" : "Požiadal/a si"} o zmazanie — tréningy,
            výživa, denník aj správy sa natrvalo odstránia o {daysLabel(daysLeft(requestedAt))}.
          </p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={cancel} disabled={pending}>
            Zrušiť zmazanie
          </button>
        </>
      ) : confirming ? (
        <>
          <p className={styles.dzText}>
            Naozaj chceš zmazať svoje tréningy, jedálniček, denník aj správy s trénerom? Dáta zostanú
            30 dní (dá sa zrušiť), potom sa natrvalo odstránia.
          </p>
          <div className={styles.dzActions}>
            <button type="button" className="btn btn-primary btn-sm" onClick={request} disabled={pending}>
              Áno, zmazať
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              Nie
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(true)}>
          Požiadať o zmazanie mojich dát
        </button>
      )}
      {error && <p className={styles.dzError}>{error}</p>}
    </div>
  );
}
