"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import styles from "./builder.module.css";

/** "+ deň" — pridá deň lokálne (uloží sa cez „Uložiť zmeny"). */
export function AddMealDayInline({ nextDayNumber, onAdd }: { nextDayNumber: number; onAdd: (name: string) => void }) {
  const t = useTranslations("mealPlans.builder");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!adding) {
    return (
      <button type="button" className={styles.addDayTab} onClick={() => setAdding(true)}>
        {t("addDay")}
      </button>
    );
  }

  const close = () => {
    setAdding(false);
    setName("");
    setError(null);
  };

  return (
    <form
      className={styles.addDayForm}
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        // Vlastná slovenská hláška namiesto `required` (HTML5 bublina je v jazyku prehliadača).
        if (!trimmed) return setError(t("dayNameRequired"));
        if (trimmed.length > 120) return setError(t("dayNameTooLong"));
        onAdd(trimmed);
        close();
      }}
    >
      <input
        type="text"
        placeholder={t("dayPlaceholder", { n: nextDayNumber })}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
        autoFocus
        className={styles.addDayInput}
      />
      <button type="submit" className="btn btn-primary btn-sm">
        {t("add")}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={close}>
        {t("cancel")}
      </button>
      {error && <p className={styles.formError}>{error}</p>}
    </form>
  );
}
