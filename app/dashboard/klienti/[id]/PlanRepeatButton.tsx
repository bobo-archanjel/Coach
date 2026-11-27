"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { ProgressionDialog, type ProgressionDay } from "@/app/portal/trening/PlanReviewView";
import { createProgressedPlanAction, getPlanProgressionAction } from "@/app/dashboard/treningy/actions";
import { ActionSparkIcon } from "@/app/components/ActionIcons";
import pa from "@/app/components/planActions.module.css";
import styles from "../../dashboard.module.css";

/**
 * „Zopakovať s progresiou“ na karte hotového plánu (detail klienta → Tréningy): po kliknutí sa
 * načíta návrh záťaže, otvorí sa okno s voľbou % a potvrdenie vytvorí nový koncept (redirect).
 */
export function PlanRepeatButton({ planId }: { planId: string }) {
  const t = useTranslations("plans.review");
  const [data, setData] = useState<{ days: ProgressionDay[]; ready: Record<string, number> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [creating, startCreate] = useTransition();

  const open = () => {
    setError(null);
    startLoad(async () => {
      const res = await getPlanProgressionAction(planId).catch(() => ({ error: t("repeat") }));
      if ("error" in res) setError(res.error);
      else setData(res);
    });
  };

  const create = (pct: number) => {
    setError(null);
    startCreate(async () => {
      // úspech → redirect na nový koncept vnútri akcie; sem sa vrátime len pri chybe
      const res = await createProgressedPlanAction(planId, pct);
      if (res?.error) setError(res.error);
    });
  };

  return (
    <>
      <button
        type="button"
        className={`${pa.action} ${pa.wide} ${pa.primary} ${pa.fullRow}`}
        onClick={open}
        disabled={loading}
        aria-busy={loading || undefined}
        data-testid="plan-repeat"
      >
        <ActionSparkIcon />
        {t("repeat")}
      </button>
      {!data && error && (
        <span className={styles.publishError} role="alert">
          {error}
        </span>
      )}
      {data && (
        <ProgressionDialog
          days={data.days}
          ready={data.ready}
          voice="trainer"
          pending={creating}
          error={error}
          onCreate={create}
          onClose={() => {
            setData(null);
            setError(null);
          }}
        />
      )}
    </>
  );
}
