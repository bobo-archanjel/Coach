"use client";

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
          Naozaj zmazať tréning „{planName}“? Klient ho prestane vidieť v portáli a nedá sa to vrátiť späť.
          {hasCompleted && " Tréningy, ktoré už klient odcvičil, ostanú uložené."}
        </p>
        <button type="button" className="btn btn-primary btn-sm" onClick={doDelete} disabled={pending}>
          {pending ? "Mažem…" : "Áno, zmazať"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)} disabled={pending}>
          Zrušiť
        </button>
        {error && <p className={`${styles.publishError} ${styles.templateStatus}`}>{error}</p>}
      </div>
    );
  }

  return (
    <div className={styles.templateGrid}>
      <a href={`/api/export/plan/${planId}/pdf`} className="btn btn-ghost btn-sm">
        Stiahnuť PDF
      </a>
      {published && (
        <button type="button" className={`btn btn-ghost btn-sm ${styles.dangerGhost}`} onClick={() => setConfirming(true)}>
          Zmazať
        </button>
      )}
    </div>
  );
}
