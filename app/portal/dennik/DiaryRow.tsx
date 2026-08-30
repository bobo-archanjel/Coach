"use client";

import { useActionState } from "react";
import type { PortalDiaryEntry } from "@/lib/portal/types";
import { removeFoodLogAction, type ActionState } from "../actions";
import styles from "../portal.module.css";

const initialState: ActionState = { error: null };

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

export function DiaryRow({ entry }: { entry: PortalDiaryEntry }) {
  const [state, formAction, pending] = useActionState(removeFoodLogAction, initialState);

  return (
    <li className={styles.diaryRow} data-pending={pending || undefined}>
      <span>
        <span className={styles.diaryName}>{entry.name}</span>
        <span className={styles.diaryMeta}>
          {entry.grams} g · {entry.proteinG}g B · {entry.carbsG}g S · {entry.fatG}g T
        </span>
      </span>
      <span className={styles.diaryKcalCell}>{entry.kcal} kcal</span>
      <form action={formAction}>
        <input type="hidden" name="entry_id" value={entry.id} readOnly />
        <button
          type="submit"
          className={styles.removeBtn}
          disabled={pending}
          aria-label={`Odobrať ${entry.name}`}
        >
          <TrashIcon />
        </button>
      </form>
      {state.error && (
        <p className={styles.diaryRowError} role="alert">
          Nepodarilo sa odobrať — {state.error}
        </p>
      )}
    </li>
  );
}
