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

  const [confirmingEnd, setConfirmingEnd] = useState(false);
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
      else setConfirmingEnd(false);
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
        <div className={styles.dangerSection}>
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
          ) : confirmingEnd ? (
            <>
              <p className={styles.dangerText}>
                Naozaj ukončiť spoluprácu s klientom {firstName}? Klient dostane správu v chate. Tréningy, výživa
                aj denník zostanú uložené a spoluprácu môžeš kedykoľvek obnoviť.
              </p>
              <div className={styles.dangerActions}>
                <button type="button" className="btn btn-primary btn-sm" onClick={endCooperation} disabled={coopPending}>
                  Áno, ukončiť
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setConfirmingEnd(false)}
                  disabled={coopPending}
                >
                  Nie
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmingEnd(true)}>
              Ukončiť spoluprácu
            </button>
          )}
          {coopError && <p className={styles.dangerError}>{coopError}</p>}
        </div>
      )}

      <div className={styles.dangerSection}>
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
              Naozaj zmazať klienta {firstName}? Tréningy, jedálniček, denník aj chat zostanú 30 dní (dá sa zrušiť),
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
