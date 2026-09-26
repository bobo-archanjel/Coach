"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { renamePlanAction } from "../actions";
import styles from "../../dashboard.module.css";

const PencilIcon = () => (
  <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M9.5 1.5 12.5 4.5 4.5 12.5H1.5V9.5L9.5 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

/**
 * Názov plánu s ceruzkou — klik prepne nadpis na pole priamo na mieste,
 * pod ním Uložiť | Zrušiť v rovnakej mriežke ako ostatné akcie plánu.
 * Enter uloží, Esc zruší. Nahradil samostatné „Iný názov" pri šablóne:
 * šablóna sa ukladá pod názvom plánu.
 */
export function PlanTitle({ planId, name }: { planId: string; name: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [shown, setShown] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Nový názov zo servera (revalidácia) — zosúladiť, kým sa needituje.
  useEffect(() => {
    if (!editing) {
      setShown(name);
      setValue(name);
    }
  }, [name, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const cancel = () => {
    setValue(shown);
    setError(null);
    setEditing(false);
  };

  const save = () => {
    const next = value.trim();
    if (next === shown) return cancel();
    setError(null);
    startTransition(async () => {
      const res = await renamePlanAction(planId, next);
      if (res.error) {
        setError(res.error);
        return;
      }
      setShown(next);
      setEditing(false);
    });
  };

  if (!editing) {
    return (
      <div className={styles.planTitleRow}>
        <h1>{shown}</h1>
        <button
          type="button"
          className={styles.planTitleEdit}
          onClick={() => setEditing(true)}
          aria-label="Upraviť názov plánu"
          title="Upraviť názov plánu"
        >
          <PencilIcon />
        </button>
      </div>
    );
  }

  return (
    <form
      className={styles.planTitleForm}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <input
        ref={inputRef}
        type="text"
        aria-label="Názov plánu"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
        }}
        maxLength={120}
        disabled={pending}
        className={styles.planTitleInput}
      />
      <div className={styles.templateGrid}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? "Ukladám…" : "Uložiť"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={cancel} disabled={pending}>
          Zrušiť
        </button>
        {error && <p className={`${styles.publishError} ${styles.templateStatus}`}>{error}</p>}
      </div>
    </form>
  );
}
