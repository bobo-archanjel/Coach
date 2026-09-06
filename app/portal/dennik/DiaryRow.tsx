"use client";

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

/**
 * Odobratie ide cez `onRemove` z rodiča (DiaryView) — ten spustí optimistic
 * odobratie zo zdieľaného zoznamu + skutočnú server action v jednej transition,
 * takže riadok zmizne hneď, nie až po revalidatePath. Vlastný pending stav tu
 * už netreba (predtým `useActionState` priamo tu) — kým sa čaká na server,
 * riadok už nie je vidno; pri chybe ho React sám vráti späť.
 */
export function DiaryRow({ entry, onRemove }: { entry: PortalDiaryEntry; onRemove: (id: string) => void }) {
  return (
    <li className={styles.diaryRow}>
      <span>
        <span className={styles.diaryName}>{entry.name}</span>
        <span className={styles.diaryMeta}>
          {entry.grams} g · {entry.proteinG}g B · {entry.carbsG}g S · {entry.fatG}g T
        </span>
      </span>
      <span className={styles.diaryKcalCell}>{entry.kcal} kcal</span>
      <button type="button" className={styles.removeBtn} onClick={() => onRemove(entry.id)} aria-label={`Odobrať ${entry.name}`}>
        <TrashIcon />
      </button>
    </li>
  );
}
