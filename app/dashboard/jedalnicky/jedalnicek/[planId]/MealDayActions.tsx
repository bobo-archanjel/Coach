"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { DayNameDialog } from "@/app/components/DayNameDialog";
import wb from "@/app/components/workoutBuilder.module.css";

/**
 * Akcie vybraného dňa jedálnička pod dráhou dní — rovnako ako v buildri tréningu
 * (spoločný workoutBuilder.module.css): „Premenovať“ otvorí okno (DayNameDialog),
 * „Duplikovať“, „Zmazať deň“ s potvrdením na celý riadok (Esc = zrušiť). Zmeny sú
 * lokálne, do DB idú cez „Uložiť zmeny". Rodič ho kľúčuje podľa dňa, takže prepnutie
 * dňa rozpracované potvrdenie zahodí.
 */
export function MealDayActions({
  name,
  foodCount,
  canDuplicate,
  onRename,
  onDuplicate,
  onDelete,
}: {
  name: string;
  foodCount: number;
  /** false = jedálniček má už maximum dní */
  canDuplicate: boolean;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("mealPlans.builder");
  const [mode, setMode] = useState<"idle" | "renaming" | "confirmingDelete">("idle");

  useEffect(() => {
    if (mode !== "confirmingDelete") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMode("idle");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  return (
    <div className={wb.dayHead}>
      {mode === "renaming" && (
        <DayNameDialog
          title={t("renameDayTitle")}
          label={t("dayName")}
          inputId="meal-day-rename"
          initialValue={name}
          maxLength={120}
          submitLabel={t("done")}
          cancelLabel={t("cancel")}
          closeLabel={t("close")}
          onSubmit={(next) => {
            if (!next) return t("dayNameRequired");
            if (next.length > 120) return t("dayNameTooLong");
            onRename(next);
            setMode("idle");
            return null;
          }}
          onClose={() => setMode("idle")}
        />
      )}
      <div className={wb.dayActionsRow}>
        {mode === "confirmingDelete" ? (
          <div className={wb.deleteDayConfirm} role="alertdialog" aria-label={t("deleteDayAria", { name })}>
            <p className={wb.deleteDayQuestion}>{t("deleteDayConfirm", { name, count: foodCount })}</p>
            <div className={wb.deleteDayActions}>
              <button type="button" className="btn btn-primary btn-sm btn-danger" onClick={onDelete}>
                {t("yesDeleteDay")}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("idle")}>
                {t("cancel")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <button type="button" className={wb.dayActionTab} onClick={() => setMode("renaming")}>
              {t("rename")}
            </button>
            <button
              type="button"
              className={wb.dayActionTab}
              onClick={onDuplicate}
              disabled={!canDuplicate}
              title={canDuplicate ? t("duplicateTitle") : t("maxDays")}
            >
              {t("duplicate")}
            </button>
            <button type="button" className={wb.deleteDayTab} onClick={() => setMode("confirmingDelete")}>
              {t("deleteDay")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
