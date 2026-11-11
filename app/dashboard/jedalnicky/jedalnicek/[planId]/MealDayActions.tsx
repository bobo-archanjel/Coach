"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import styles from "./builder.module.css";

/**
 * "Premenovať" + "Duplikovať" + "Zmazať deň" vedľa "+ deň" v riadku pilulek — rovnaký vzor ako
 * DeleteDayControl v tréningovom builderi. Premenovanie aj potvrdenie zmazania
 * zaberú celý riadok pod pilulkami; Esc = zrušiť. Zmeny sú lokálne, do DB idú cez
 * „Uložiť zmeny". Rodič ho kľúčuje podľa dňa, takže prepnutie dňa formulár zahodí.
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
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "idle") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMode("idle");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  if (mode === "renaming") {
    return (
      <form
        className={`${styles.addDayForm} ${styles.renameDayForm}`}
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = value.trim();
          if (!trimmed) return setError(t("dayNameRequired"));
          if (trimmed.length > 120) return setError(t("dayNameTooLong"));
          onRename(trimmed);
          setMode("idle");
        }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={t("dayName")}
          className={styles.addDayInput}
          autoFocus
        />
        <button type="submit" className="btn btn-primary btn-sm">
          {t("done")}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("idle")}>
          {t("cancel")}
        </button>
        {error && <p className={styles.formError}>{error}</p>}
      </form>
    );
  }

  if (mode === "confirmingDelete") {
    return (
      <div className={styles.deleteDayConfirm} role="alertdialog" aria-label={t("deleteDayAria", { name })}>
        <p className={styles.deleteDayQuestion}>{t("deleteDayConfirm", { name, count: foodCount })}</p>
        <div className={styles.deleteDayActions}>
          <button type="button" className="btn btn-primary btn-sm btn-danger" onClick={onDelete}>
            {t("yesDeleteDay")}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("idle")}>
            {t("cancel")}
          </button>
        </div>
      </div>
    );
  }

  // akcie aktívneho dňa vždy spolu v jednom riadku pod pilulkami dní
  return (
    <div className={styles.dayActionsRow}>
      <button
        type="button"
        className={styles.renameDayTab}
        onClick={() => {
          setValue(name);
          setError(null);
          setMode("renaming");
        }}
      >
        {t("rename")}
      </button>
      <button
        type="button"
        className={styles.renameDayTab}
        onClick={onDuplicate}
        disabled={!canDuplicate}
        title={canDuplicate ? t("duplicateTitle") : t("maxDays")}
      >
        {t("duplicate")}
      </button>
      <button type="button" className={styles.deleteDayTab} onClick={() => setMode("confirmingDelete")}>
        {t("deleteDay")}
      </button>
    </div>
  );
}
