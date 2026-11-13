"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { renameDayAction } from "../actions";
import { DayNameDialog } from "@/app/components/DayNameDialog";

/**
 * "Premenovať" deň — okno s názvom dňa (rovnaké ako „+ deň“). Názov sa hneď uloží
 * (ako ostatné úpravy trénerovho plánu); po úspechu sa okno zavrie (`onClose`).
 */
export function RenameDayDialog({
  planId,
  dayId,
  name,
  onClose,
}: {
  planId: string;
  dayId: string;
  name: string;
  onClose: () => void;
}) {
  const t = useTranslations("plans.builder");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <DayNameDialog
      title={t("renameDayTitle")}
      label={t("dayName")}
      inputId="trainer-day-rename"
      initialValue={name}
      submitLabel={pending ? t("saving") : t("done")}
      cancelLabel={t("cancel")}
      closeLabel={t("close")}
      pending={pending}
      error={error}
      onSubmit={(trimmed) => {
        if (!trimmed) return t("dayNameRequired");
        if (trimmed === name) {
          onClose();
          return null;
        }
        setError(null);
        startTransition(async () => {
          const res = await renameDayAction(planId, dayId, trimmed);
          if (res.error) setError(res.error);
          else onClose();
        });
        return null;
      }}
      onClose={onClose}
    />
  );
}
