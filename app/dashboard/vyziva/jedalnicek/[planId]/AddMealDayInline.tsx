"use client";

import { useState } from "react";
import mealBuilderModule from "./builder.module.css";
import { useSkinStyles } from "@/app/components/uiSkin";

/** "+ deň" — pridá deň lokálne (uloží sa cez „Uložiť zmeny"). */
export function AddMealDayInline({ nextDayNumber, onAdd }: { nextDayNumber: number; onAdd: (name: string) => void }) {
  const styles = useSkinStyles("mealBuilder", mealBuilderModule);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!adding) {
    return (
      <button type="button" className={styles.addDayTab} onClick={() => setAdding(true)}>
        + deň
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
        if (!trimmed) return setError("Zadaj názov dňa.");
        if (trimmed.length > 120) return setError("Názov dňa môže mať najviac 120 znakov.");
        onAdd(trimmed);
        close();
      }}
    >
      <input
        type="text"
        placeholder={`napr. Deň ${nextDayNumber}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
        autoFocus
        className={styles.addDayInput}
      />
      <button type="submit" className="btn btn-primary btn-sm">
        Pridať
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={close}>
        Zrušiť
      </button>
      {error && <p className={styles.formError}>{error}</p>}
    </form>
  );
}
