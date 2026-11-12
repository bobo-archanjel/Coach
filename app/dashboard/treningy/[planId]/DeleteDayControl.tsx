"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { deleteDayAction } from "../actions";
import styles from "@/app/components/workoutBuilder.module.css";

/**
 * "Zmazať deň" vedľa "+ deň" — zmaže práve zvolený deň. Dvojkrokové inline
 * potvrdenie (rovnaký vzor ako "Zmazať koncept" v PublishControl), aby náhodný
 * klik nič nezmazal. Esc = zrušiť. Rodič ho kľúčuje podľa dňa, takže prepnutie
 * dňa rozpracované potvrdenie zahodí.
 */
export function DeleteDayControl({
  planId,
  dayId,
  dayName,
  exerciseCount,
  hasCompleted,
}: {
  planId: string;
  dayId: string;
  dayName: string;
  exerciseCount: number;
  /** klient už tento deň odcvičil — ukážeme, že jeho záznamy ostanú */
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
      const res = await deleteDayAction(planId, dayId);
      if (res.error) setError(res.error);
      // Úspech → revalidácia pošle nové `days`, PlanBuilder prepne na prvý zostávajúci deň.
    });
  };

  if (!confirming) {
    return (
      <button type="button" className={styles.deleteDayTab} onClick={() => setConfirming(true)}>
        {t("deleteDay")}
      </button>
    );
  }

  return (
    <div className={styles.deleteDayConfirm} role="alertdialog" aria-labelledby={`delete-day-${dayId}`}>
      <p id={`delete-day-${dayId}`} className={styles.deleteDayQuestion}>
        {t("deleteDayConfirm", { name: dayName, count: exerciseCount })}
        {hasCompleted && t("deleteDayKeepsLogs")}
      </p>
      <div className={styles.deleteDayActions}>
        <button type="button" className="btn btn-primary btn-sm btn-danger" onClick={doDelete} disabled={pending}>
          {pending ? t("deleting") : t("yesDeleteDay")}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)} disabled={pending}>
          {t("cancel")}
        </button>
      </div>
      {error && <p className={styles.formError}>{error}</p>}
    </div>
  );
}
