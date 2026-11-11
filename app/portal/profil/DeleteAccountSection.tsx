"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { cancelOwnDeletionAction, requestOwnDeletionAction } from "../actions";
import styles from "../portal.module.css";

const GRACE_DAYS = 30;

function daysLeft(requestedAt: string): number {
  const deadline = new Date(requestedAt).getTime() + GRACE_DAYS * 24 * 3600_000;
  return Math.max(0, Math.ceil((deadline - Date.now()) / (24 * 3600_000)));
}

export function DeleteAccountSection({
  requestedAt,
  requestedBy,
}: {
  requestedAt: string | null;
  requestedBy: "trainer" | "client" | null;
}) {
  const t = useTranslations("profile.deletion");
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
      <p className={styles.panelLabel}>{t("title")}</p>
      {requestedAt ? (
        <>
          <p className={styles.dzText}>
            {requestedBy === "trainer"
              ? t("byTrainer", { days: daysLeft(requestedAt) })
              : t("byYou", { days: daysLeft(requestedAt) })}
          </p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={cancel} disabled={pending}>
            {t("cancel")}
          </button>
        </>
      ) : confirming ? (
        <>
          <p className={styles.dzText}>
            {t("confirm")}
          </p>
          <div className={styles.dzActions}>
            <button type="button" className="btn btn-primary btn-sm btn-danger" onClick={request} disabled={pending}>
              {t("yes")}
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
          {t("request")}
        </button>
      )}
      {error && <p className={styles.dzError}>{error}</p>}
    </div>
  );
}
