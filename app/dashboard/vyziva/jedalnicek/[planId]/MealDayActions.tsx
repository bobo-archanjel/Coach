"use client";

import { useEffect, useState } from "react";
import styles from "./builder.module.css";

function foodsLabel(n: number): string {
  if (n === 0) return "";
  if (n === 1) return " aj s 1 potravinou";
  return ` aj s ${n} potravinami`;
}

/**
 * "Premenovať deň" + "Zmazať deň" vedľa "+ deň" v riadku pilulek — rovnaký vzor ako
 * DeleteDayControl v tréningovom builderi. Premenovanie aj potvrdenie zmazania
 * zaberú celý riadok pod pilulkami; Esc = zrušiť. Zmeny sú lokálne, do DB idú cez
 * „Uložiť zmeny". Rodič ho kľúčuje podľa dňa, takže prepnutie dňa formulár zahodí.
 */
export function MealDayActions({
  name,
  foodCount,
  onRename,
  onDelete,
}: {
  name: string;
  foodCount: number;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
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
          if (!trimmed) return setError("Zadaj názov dňa.");
          if (trimmed.length > 120) return setError("Názov dňa môže mať najviac 120 znakov.");
          onRename(trimmed);
          setMode("idle");
        }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Názov dňa"
          className={styles.addDayInput}
          autoFocus
        />
        <button type="submit" className="btn btn-primary btn-sm">
          Hotovo
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("idle")}>
          Zrušiť
        </button>
        {error && <p className={styles.formError}>{error}</p>}
      </form>
    );
  }

  if (mode === "confirmingDelete") {
    return (
      <div className={styles.deleteDayConfirm} role="alertdialog" aria-label={`Zmazať deň ${name}`}>
        <p className={styles.deleteDayQuestion}>Zmazať deň „{name}“{foodsLabel(foodCount)}?</p>
        <div className={styles.deleteDayActions}>
          <button type="button" className="btn btn-primary btn-sm" onClick={onDelete}>
            Áno, zmazať deň
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("idle")}>
            Zrušiť
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className={styles.renameDayTab}
        onClick={() => {
          setValue(name);
          setError(null);
          setMode("renaming");
        }}
      >
        Premenovať deň
      </button>
      <button type="button" className={styles.deleteDayTab} onClick={() => setMode("confirmingDelete")}>
        Zmazať deň
      </button>
    </>
  );
}
