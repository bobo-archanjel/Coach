"use client";

import { useEffect, useState, useTransition } from "react";
import { renameDayAction } from "../actions";
import builderModule from "./builder.module.css";
import { useSkinStyles } from "@/app/components/uiSkin";

/**
 * "Premenovať" deň — formulár na celý riadok pod pilulkami (rovnako ako v jedálničku,
 * MealDayActions); kým je otvorený, Duplikovať/Zmazať deň sa skryjú. Názov sa hneď
 * uloží (ako ostatné úpravy trénerovho plánu). Esc aj Zrušiť = `onClose`.
 */
export function RenameDayForm({
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
  const styles = useSkinStyles("builder", builderModule);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  return (
    <form
      className={`${styles.addDayForm} ${styles.renameDayForm}`}
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = value.trim();
        if (!trimmed) return setError("Zadaj názov dňa.");
        if (trimmed === name) return onClose();
        setError(null);
        startTransition(async () => {
          const res = await renameDayAction(planId, dayId, trimmed);
          if (res.error) setError(res.error);
          else onClose();
        });
      }}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Názov dňa"
        maxLength={120}
        className={styles.addDayInput}
        disabled={pending}
        autoFocus
      />
      <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
        {pending ? "Ukladám…" : "Hotovo"}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={pending}>
        Zrušiť
      </button>
      {error && <p className={styles.formError}>{error}</p>}
    </form>
  );
}
