"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { deletePlanAction } from "../actions";
import styles from "../../dashboard.module.css";

/**
 * Spodok detailu plánu: "Stiahnuť PDF" + "Zmazať" (len publikovaný plán — koncept
 * má "Zmazať koncept" hore v PublishActions). Zmazanie je dvojkrokové: otázka na
 * celú šírku mriežky, pod ňou Áno | Zrušiť (Esc = zrušiť). Odcvičené tréningy
 * zmazanie prežijú (plan_snapshot, 0048) — ak nejaké sú, otázka to povie.
 */
export function PlanFooterActions({
  planId,
  planName,
  published,
  hasCompleted,
}: {
  planId: string;
  planName: string;
  published: boolean;
  hasCompleted: boolean;
}) {
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
      const res = await deletePlanAction(planId);
      // Úspech → redirect na zoznam tréningov vnútri akcie. Sem sa vrátime len pri chybe.
      if (res?.error) setError(res.error);
    });
  };

  if (confirming) {
    return (
      <div className={styles.templateGrid} role="alertdialog" aria-labelledby="delete-plan-question">
        <p id="delete-plan-question" className={`${styles.publishDeleteConfirm} ${styles.templateStatus}`}>
          {t("deletePlanConfirm", { name: planName })}
          {hasCompleted && t("deletePlanKeepsLogs")}
        </p>
        <button type="button" className="btn btn-primary btn-sm btn-danger" onClick={doDelete} disabled={pending}>
          {pending ? t("deleting") : t("yesDelete")}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)} disabled={pending}>
          {t("cancel")}
        </button>
        {error && <p className={`${styles.publishError} ${styles.templateStatus}`}>{error}</p>}
      </div>
    );
  }

  return (
    <div className={styles.templateGrid}>
      <a href={`/api/export/plan/${planId}/pdf`} className="btn btn-ghost btn-sm">
        {t("downloadPdf")}
      </a>
      {published && (
        <button type="button" className={`btn btn-ghost btn-sm btn-danger ${styles.dangerGhost}`} onClick={() => setConfirming(true)}>
          {t("delete")}
        </button>
      )}
    </div>
  );
}
