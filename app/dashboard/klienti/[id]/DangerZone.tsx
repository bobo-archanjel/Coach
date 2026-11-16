"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelClientDeletionAction,
  endClientCooperationAction,
  removeClientFromPortfolioAction,
  requestClientDeletionAction,
  resumeClientCooperationAction,
} from "../actions";
import styles from "../../dashboard.module.css";

const GRACE_DAYS = 30;

function daysLeft(requestedAt: string): number {
  const deadline = new Date(requestedAt).getTime() + GRACE_DAYS * 24 * 3600_000;
  return Math.max(0, Math.ceil((deadline - Date.now()) / (24 * 3600_000)));
}

export function DangerZone({
  clientId,
  firstName,
  endedAt,
  deletionRequestedAt,
  deletionRequestedBy,
  hasAccount,
}: {
  clientId: string;
  firstName: string;
  endedAt: string | null;
  deletionRequestedAt: string | null;
  deletionRequestedBy: "trainer" | "client" | null;
  /** klient s vlastným FitPilot účtom — tréner ho nemaže, len odstráni z portfólia (0064) */
  hasAccount: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("clientDetail.danger");
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
  const remove = () => {
    startTransition(async () => {
      const res = await removeClientFromPortfolioAction(clientId);
      if (res.error) setError(res.error);
      else router.push("/dashboard"); // klient už nie je v portfóliu — detail by bol 404
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
          <h3>{t("coopTitle")}</h3>
          {endedAt ? (
            <>
              <p className={styles.dangerText}>
                {t("coopEnded", { name: firstName })}
              </p>
              <button type="button" className="btn btn-ghost btn-sm" onClick={resumeCooperation} disabled={coopPending}>
                {t("resume")}
              </button>
            </>
          ) : confirmingEnd ? (
            <>
              <p className={styles.dangerText}>
                {t("confirmEnd", { name: firstName })}
              </p>
              <div className={styles.dangerActions}>
                <button type="button" className="btn btn-primary btn-sm btn-danger" onClick={endCooperation} disabled={coopPending}>
                  {t("yesEnd")}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setConfirmingEnd(false)}
                  disabled={coopPending}
                >
                  {t("no")}
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={() => setConfirmingEnd(true)}>
              {t("end")}
            </button>
          )}
          {coopError && <p className={styles.dangerError}>{coopError}</p>}
        </div>
      )}

      {/* Klient s vlastným účtom: jeho dáta zmaže len on sám (Profil). Tréner ho odstráni
          z portfólia — klientovi ostanú plány, jedálničky aj vlastné dáta (0064). Prebiehajúcu
          žiadosť KLIENTA o zmazanie ukáže sekcia nižšie. */}
      {hasAccount && !deletionRequestedAt ? (
        <div className={styles.dangerSection}>
          <h3>{t("removeTitle")}</h3>
          {confirming ? (
            <>
              <p className={styles.dangerText}>{t("confirmRemove", { name: firstName })}</p>
              <div className={styles.dangerActions}>
                <button type="button" className="btn btn-primary btn-sm btn-danger" onClick={remove} disabled={pending}>
                  {t("yesRemove")}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)} disabled={pending}>
                  {t("no")}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className={styles.dangerText}>{t("removeHint", { name: firstName })}</p>
              <button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={() => setConfirming(true)}>
                {t("remove")}
              </button>
            </>
          )}
          {error && <p className={styles.dangerError}>{error}</p>}
        </div>
      ) : (
      <div className={styles.dangerSection}>
        <h3>{t("deleteTitle")}</h3>
        {deletionRequestedAt ? (
          <>
            <p className={styles.dangerText}>
              {deletionRequestedBy === "client"
                ? t("requestedByClient", { name: firstName, days: daysLeft(deletionRequestedAt) })
                : t("requestedByYou", { days: daysLeft(deletionRequestedAt) })}
            </p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={cancel} disabled={pending}>
              {t("cancelDeletion")}
            </button>
          </>
        ) : confirming ? (
          <>
            <p className={styles.dangerText}>
              {t("confirmDelete", { name: firstName })}
            </p>
            <div className={styles.dangerActions}>
              <button type="button" className="btn btn-primary btn-sm btn-danger" onClick={request} disabled={pending}>
                {t("yesDelete")}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirming(false)}
                disabled={pending}
              >
                {t("no")}
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={() => setConfirming(true)}>
            {t("requestDelete")}
          </button>
        )}
        {error && <p className={styles.dangerError}>{error}</p>}
      </div>
      )}
    </>
  );
}
