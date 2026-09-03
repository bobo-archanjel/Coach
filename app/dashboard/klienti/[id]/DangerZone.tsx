"use client";

import { useState, useTransition } from "react";
import {
  cancelClientDeletionAction,
  endClientCooperationAction,
  requestClientDeletionAction,
  resumeClientCooperationAction,
} from "../actions";
import styles from "../../dashboard.module.css";

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

export function DangerZone({
  clientId,
  firstName,
  endedAt,
  deletionRequestedAt,
  deletionRequestedBy,
}: {
  clientId: string;
  firstName: string;
  endedAt: string | null;
  deletionRequestedAt: string | null;
  deletionRequestedBy: "trainer" | "client" | null;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [coopError, setCoopError] = useState<string | null>(null);
  const [coopPending, startCoopTransition] = useTransition();

  const request = () => {
    startTransition(async () => {
      const res = await requestClientDeletionAction(clientId);
      if (res.error) setError(res.error);
      else setConfirming(false);
    });
  };

  const cancel = () => {
    startTransition(async () => {
      const res = await cancelClientDeletionAction(clientId);
      if (res.error) setError(res.error);
    });
  };

  const endCooperation = () => {
    startCoopTransition(async () => {
      const res = await endClientCooperationAction(clientId);
      if (res.error) setCoopError(res.error);
    });
  };

  const resumeCooperation = () => {
    startCoopTransition(async () => {
      const res = await resumeClientCooperationAction(clientId);
      if (res.error) setCoopError(res.error);
    });
  };

  return (
    <>
      {/* Ukončenie spolupráce (0020) — nesúvisí s GDPR výmazom nižšie, dáta ostávajú. */}
      {!deletionRequestedAt && (
        <div className={styles.card}>
          <h3>Spolupráca</h3>
          {endedAt ? (
            <>
              <p className={styles.dangerText}>
                Spolupráca s klientom {firstName} je ukončená — tréningy, výživa aj denník zostávajú
                uložené, kedykoľvek sa dá obnoviť.
              </p>
              <button type="button" className="btn btn-ghost btn-sm" onClick={resumeCooperation} disabled={coopPending}>
                Obnoviť spoluprácu
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={endCooperation} disabled={coopPending}>
              Ukončiť spoluprácu
            </button>
          )}
          {coopError && <p className={styles.dangerError}>{coopError}</p>}
        </div>
      )}

      <div className={styles.card}>
        <h3>Zmazanie klienta</h3>
        {deletionRequestedAt ? (
          <>
            <p className={styles.dangerText}>
              {deletionRequestedBy === "client" ? `${firstName} požiadal/a` : "Požiadal/a si"} o zmazanie —
              tréningy, výživa, denník aj správy sa natrvalo odstránia o {daysLabel(daysLeft(deletionRequestedAt))}.
            </p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={cancel} disabled={pending}>
              Zrušiť zmazanie
            </button>
          </>
        ) : confirming ? (
          <>
            <p className={styles.dangerText}>
              Naozaj zmazať {firstName}a? Tréningy, jedálniček, denník aj chat zostanú 30 dní (dá sa zrušiť),
              potom sa natrvalo odstránia.
            </p>
            <div className={styles.dangerActions}>
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
            Požiadať o zmazanie klienta
          </button>
        )}
        {error && <p className={styles.dangerError}>{error}</p>}
      </div>
    </>
  );
}
