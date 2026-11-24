"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { Locale } from "@/lib/i18n/locales";
import type { DoneDay } from "@/lib/dashboard/planDoneDays";
import { formatCompletedDate } from "@/lib/workouts/completed";
import { BuilderDialog } from "@/app/components/BuilderDialog";
import { CompletedExercises } from "@/app/components/CompletedExercises";
import styles from "../../dashboard.module.css";

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ChevronIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Odcvičený deň na karte plánu (detail klienta → Tréningy): klik otvorí okno s cvikmi
 * a zapísanými sériami (plán vs. skutočnosť), dátumom, náročnosťou a poznámkou klienta.
 */
export function DoneDayItem({ name, done }: { name: string; done: DoneDay }) {
  const t = useTranslations("clientDetail");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState(false);
  return (
    <li className={`${styles.cpDay} ${styles.cpDayClickable}`} data-done="true">
      <button
        type="button"
        className={styles.cpDayBtn}
        onClick={() => setOpen(true)}
        aria-label={t("doneDayAria", { name })}
        aria-haspopup="dialog"
      >
        <span className={styles.cpDayMark} aria-hidden="true">
          <CheckIcon />
        </span>
        <span className={styles.cpDayName}>{name}</span>
        <span className={styles.cpDayChevron}>
          <ChevronIcon />
        </span>
      </button>
      {open && (
        <BuilderDialog title={name} closeLabel={tc("close")} onClose={() => setOpen(false)} wide>
          <div className={styles.doneDayDialog} data-testid="done-day-dialog">
            <p className={styles.doneDayMeta}>
              {t("doneOn", { date: formatCompletedDate(done.completedAt, locale) })}
              {done.rpe != null && <> · {t("doneRpe", { rpe: done.rpe })}</>}
            </p>
            {done.note && <p className={styles.doneDayNote}>„{done.note}“</p>}
            {done.compare.exercises.length > 0 ? (
              <CompletedExercises exercises={done.compare.exercises} hasPlan={done.compare.hasPlan} />
            ) : (
              <p className={styles.noWorkouts}>{t("doneNoValues")}</p>
            )}
          </div>
        </BuilderDialog>
      )}
    </li>
  );
}
