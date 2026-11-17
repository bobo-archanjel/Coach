"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { cancelOwnDeletionAction, requestOwnDeletionAction } from "../actions";
import styles from "../portal.module.css";
import pa from "@/app/components/planActions.module.css";
import { ActionResumeIcon, ActionTrashIcon } from "@/app/components/ActionIcons";

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
          <button type="button" className={`${pa.action} ${pa.small} ${pa.inline}`} onClick={cancel} disabled={pending}>
            <ActionResumeIcon />
            {t("cancel")}
          </button>
        </>
      ) : confirming ? (
        <div className={pa.confirm} role="alertdialog" aria-label={t("confirm")}>
          <p className={pa.confirmText}>{t("confirm")}</p>
          <span className={pa.confirmBtns}>
            <button type="button" className={pa.confirmNo} onClick={() => setConfirming(false)} disabled={pending}>
              {t("no")}
            </button>
            <button type="button" className={pa.confirmYes} onClick={request} disabled={pending}>
              {t("yes")}
            </button>
          </span>
        </div>
      ) : (
        <button type="button" className={`${pa.action} ${pa.small} ${pa.inline} ${pa.danger}`} onClick={() => setConfirming(true)}>
          <ActionTrashIcon />
          {t("request")}
        </button>
      )}
      {error && <p className={styles.dzError}>{error}</p>}
    </div>
  );
}
