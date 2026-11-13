"use client";

import { useTranslations } from "next-intl";
import { DayNameDialog } from "@/app/components/DayNameDialog";

/** "+ deň" — okno s názvom dňa; deň sa pridá lokálne (uloží sa cez „Uložiť zmeny"). */
export function AddMealDayDialog({
  nextDayNumber,
  onAdd,
  onClose,
}: {
  nextDayNumber: number;
  onAdd: (name: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("mealPlans.builder");
  return (
    <DayNameDialog
      title={t("newDayTitle")}
      label={t("dayName")}
      inputId="meal-day-name"
      placeholder={t("dayPlaceholder", { n: nextDayNumber })}
      maxLength={120}
      submitLabel={t("add")}
      cancelLabel={t("cancel")}
      closeLabel={t("close")}
      onSubmit={(name) => {
        // vlastná hláška namiesto `required` (HTML5 bublina je v jazyku prehliadača)
        if (!name) return t("dayNameRequired");
        if (name.length > 120) return t("dayNameTooLong");
        onAdd(name);
        onClose();
        return null;
      }}
      onClose={onClose}
    />
  );
}
