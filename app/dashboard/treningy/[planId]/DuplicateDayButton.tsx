"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { duplicateDayAction } from "../actions";
import styles from "./builder.module.css";

/**
 * "Duplikovať" medzi "+ deň" a "Zmazať deň" (rovnako ako v jedálničku) — kópia práve
 * zvoleného dňa aj s cvikmi sa hneď uloží na koniec plánu; `onDuplicated` dostane ID
 * nového dňa, aby sa naň builder prepol, keď ho revalidácia prinesie.
 */
export function DuplicateDayButton({
  planId,
  dayId,
  onDuplicated,
}: {
  planId: string;
  dayId: string;
  onDuplicated: (newDayId: string) => void;
}) {
  const t = useTranslations("plans.builder");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const duplicate = () => {
    setError(null);
    startTransition(async () => {
      const res = await duplicateDayAction(planId, dayId);
      if (res.error || !res.dayId) setError(res.error ?? t("duplicateFailed"));
      else onDuplicated(res.dayId);
    });
  };

  return (
    <>
      <button
        type="button"
        className={styles.dayActionTab}
        onClick={duplicate}
        disabled={pending}
        title={t("duplicateTitle")}
      >
        {pending ? t("duplicating") : t("duplicate")}
      </button>
      {error && <p className={styles.formError}>{error}</p>}
    </>
  );
}
