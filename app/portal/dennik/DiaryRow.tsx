"use client";

import { useState } from "react";
import type { PortalDiaryEntry } from "@/lib/portal/types";
import styles from "../portal.module.css";

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M5 7h14M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.4L18 7M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PencilIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Úprava aj odobratie idú cez callbacky z rodiča (DiaryView) — ten spustí
 * optimistickú zmenu zdieľaného zoznamu + skutočnú server action v jednej
 * transition, takže riadok aj súčty sa zmenia hneď. Odobratie má inline
 * potvrdenie (QA 2026-09-23: kôš mazal okamžite, bez možnosti vrátiť).
 */
export function DiaryRow({
  entry,
  onRemove,
  onUpdateGrams,
}: {
  entry: PortalDiaryEntry;
  onRemove: (id: string) => void;
  onUpdateGrams: (id: string, grams: number) => void;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "confirmRemove">("view");
  const [grams, setGrams] = useState(String(entry.grams));
  // Optimistický riadok ešte nemá skutočné ID z DB — úprava/odobratie počká.
  const pendingRow = entry.id.startsWith("optimistic-");

  function saveGrams() {
    const g = Number(grams);
    if (!Number.isFinite(g) || g <= 0 || g > 5000) return;
    setMode("view");
    if (g !== entry.grams) onUpdateGrams(entry.id, g);
  }

  if (mode === "edit") {
    return (
      <li className={styles.diaryRow}>
        <span className={styles.diaryName}>{entry.name}</span>
        <span className={styles.gramField}>
          <input
            className={styles.gramInput}
            type="number"
            inputMode="numeric"
            min={1}
            max={5000}
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveGrams();
              if (e.key === "Escape") setMode("view");
            }}
            aria-label={`Gramáž ${entry.name}`}
            autoFocus
          />
          <span className={styles.gramUnit}>g</span>
        </span>
        <span style={{ display: "flex", gap: 6 }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={saveGrams}>
            Uložiť
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("view")}>
            Zrušiť
          </button>
        </span>
      </li>
    );
  }

  return (
    <li className={styles.diaryRow}>
      <span>
        <span className={styles.diaryName}>{entry.name}</span>
        <span className={styles.diaryMeta}>
          {entry.grams} g · {entry.proteinG}g B · {entry.carbsG}g S · {entry.fatG}g T
        </span>
      </span>
      <span className={styles.diaryKcalCell}>{entry.kcal} kcal</span>
      {mode === "confirmRemove" ? (
        <span style={{ display: "flex", gap: 6 }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onRemove(entry.id)}>
            Odobrať
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("view")}>
            Nie
          </button>
        </span>
      ) : (
        <span style={{ display: "flex", gap: 2 }}>
          <button
            type="button"
            className={styles.removeBtn}
            disabled={pendingRow}
            onClick={() => {
              setGrams(String(entry.grams));
              setMode("edit");
            }}
            aria-label={`Upraviť gramáž ${entry.name}`}
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            className={styles.removeBtn}
            disabled={pendingRow}
            onClick={() => setMode("confirmRemove")}
            aria-label={`Odobrať ${entry.name}`}
          >
            <TrashIcon />
          </button>
        </span>
      )}
    </li>
  );
}
