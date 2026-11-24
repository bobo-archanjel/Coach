"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { deleteTrainerPlanAction } from "../actions";
import pa from "@/app/components/planActions.module.css";
import styles from "../../dashboard.module.css";
import { ActionTrashIcon } from "@/app/components/ActionIcons";

/**
 * „Zmazať“ na karte plánu v detaile klienta → Tréningy. Dvojkrokové: otázka na celú šírku
 * pätičky karty, pod ňou Zrušiť | Áno, zmazať (Esc = zrušiť). Zmaže sa aj hotový plán —
 * odcvičené tréningy ostanú (workout_day_id → null, plan_snapshot 0048), otázka to povie.
 * Po zmazaní revalidácia prekreslí zoznam (karta zmizne), bez presmerovania.
 */
export function PlanCardDelete({ planId, planName, hasCompleted }: { planId: string; planName: string; hasCompleted: boolean }) {
  const t = useTranslations("plans.builder");
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
      const res = await deleteTrainerPlanAction(planId);
      if (res.error) setError(res.error);
    });
  };

  if (!confirming) {
    return (
      <button
        type="button"
        className={`${pa.action} ${pa.small} ${pa.danger}`}
        onClick={() => setConfirming(true)}
        aria-label={t("deletePlanAria", { name: planName })}
      >
        <ActionTrashIcon />
        {t("delete")}
      </button>
    );
  }

  return (
    <div className={styles.cpConfirm}>
      <div className={pa.confirm} role="alertdialog" aria-labelledby={`delete-plan-${planId}`}>
        <p id={`delete-plan-${planId}`} className={pa.confirmText}>
          {t("deletePlanConfirm", { name: planName })}
          {hasCompleted && t("deletePlanKeepsLogs")}
        </p>
        <span className={pa.confirmBtns}>
          <button type="button" className={pa.confirmNo} onClick={() => setConfirming(false)} disabled={pending}>
            {t("cancel")}
          </button>
          <button type="button" className={pa.confirmYes} onClick={doDelete} disabled={pending}>
            {pending ? t("deleting") : t("yesDelete")}
          </button>
        </span>
      </div>
      {error && (
        <p className={styles.publishError} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
