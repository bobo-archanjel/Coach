"use client";

// Nastavenia trénera → úplne dole „Zmazanie účtu“ (0062). Dvojkrokové potvrdenie ako
// zmazanie dát klienta (DeleteAccountSection v portáli); počas 30-dňovej lehoty
// ukazuje, kedy sa účet zmaže, a dá sa zrušiť.

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { intlLocale } from "@/lib/i18n/locales";
import { cancelTrainerDeletionAction, requestTrainerDeletionAction } from "./actions";
import styles from "../dashboard.module.css";
import pa from "@/app/components/planActions.module.css";
import { ActionResumeIcon, ActionTrashIcon } from "@/app/components/ActionIcons";

const GRACE_DAYS = 30;
const DAY_MS = 24 * 3600_000;

export function DeleteTrainerAccount({ requestedAt }: { requestedAt: string | null }) {
  const t = useTranslations("settings.deletion");
  const locale = useLocale();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<{ error: string | null }>) =>
    startTransition(async () => {
      const res = await action();
      setError(res.error);
      if (!res.error) setConfirming(false);
    });

  let pendingInfo: { days: number; date: string } | null = null;
  if (requestedAt) {
    const deadline = new Date(requestedAt).getTime() + GRACE_DAYS * DAY_MS;
    pendingInfo = {
      days: Math.max(0, Math.ceil((deadline - Date.now()) / DAY_MS)),
      date: new Date(deadline).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "numeric", year: "numeric" }),
    };
  }

  return (
    <div className={styles.card} data-testid="trainer-deletion">
      <h3>{t("title")}</h3>
      {pendingInfo ? (
        <>
          <p className={styles.dangerText} role="status">
            {t("pending", { days: pendingInfo.days, date: pendingInfo.date })}
          </p>
          <button
            type="button"
            className={`${pa.action} ${pa.small} ${pa.inline}`}
            onClick={() => run(cancelTrainerDeletionAction)}
            disabled={pending}
          >
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
            <button type="button" className={pa.confirmYes} onClick={() => run(requestTrainerDeletionAction)} disabled={pending}>
              {t("yes")}
            </button>
          </span>
        </div>
      ) : (
        <>
          <p className={styles.dangerText}>{t("hint")}</p>
          <button type="button" className={`${pa.action} ${pa.small} ${pa.inline} ${pa.danger}`} onClick={() => setConfirming(true)}>
            <ActionTrashIcon />
            {t("request")}
          </button>
        </>
      )}
      {error && <p className={styles.dangerError}>{error}</p>}
    </div>
  );
}
