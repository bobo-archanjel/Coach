"use client";

// Vyhodnotenie celého odcvičeného plánu pre trénera (detail plánu, feature/nahlad-analytika):
// súhrn, úspechy (rekordy oproti obdobiu pred plánom), zistenia, ako sa klientovi cvičilo
// a „Zopakovať s progresiou“ → nový koncept plánu pre klienta s vyššou záťažou.
// Rovnaké časti ako náhľad klienta (app/portal/trening/PlanReviewView), texty z pohľadu trénera.

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { PlanReview } from "@/lib/portal/planReview";
import { ProgressionDialog, ReviewOverview, ReviewTimeline, type ProgressionDay } from "@/app/portal/trening/PlanReviewView";
import { createProgressedPlanAction } from "../actions";
import styles from "@/app/portal/portal.module.css";

export function PlanReviewPanel({
  planId,
  review,
  days,
  preview = false,
}: {
  planId: string;
  review: PlanReview;
  days: ProgressionDay[];
  /** DEV náhľad — okno sa otvorí, koncept sa nevytvára */
  preview?: boolean;
}) {
  const t = useTranslations("plans.review");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const create = (pct: number) => {
    if (preview) {
      setOpen(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      // úspech → redirect na nový koncept vnútri akcie; sem sa vrátime len pri chybe
      const res = await createProgressedPlanAction(planId, pct);
      if (res?.error) setError(res.error);
    });
  };

  return (
    <section className={styles.rvPanel} aria-labelledby="plan-review-title" data-testid="trainer-plan-review">
      <h2 id="plan-review-title" className={styles.rvPanelTitle}>
        {t("reviewTitle")}
      </h2>
      <ReviewOverview review={review} voice="trainer" />
      <ReviewTimeline review={review} voice="trainer" />
      <div className={styles.rvRepeat}>
        <button type="button" className={`btn btn-primary ${styles.startBtn}`} onClick={() => setOpen(true)}>
          {t("repeat")}
        </button>
        <p className={styles.trHint}>{t("repeatHint")}</p>
      </div>
      {open && (
        <ProgressionDialog
          days={days}
          ready={review.ready}
          voice="trainer"
          pending={pending}
          error={error}
          onCreate={create}
          onClose={() => {
            setOpen(false);
            setError(null);
          }}
        />
      )}
    </section>
  );
}
