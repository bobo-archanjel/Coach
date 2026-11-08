"use client";

import { useState, useTransition } from "react";
import { dismissCooperationNoticeAction } from "./actions";
import styles from "./portal.module.css";

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

/* Banner "spolupráca ukončená" (0020) — X zavrie natrvalo (dismiss_cooperation_notice),
   kým sa spolupráca znova neukončí. Skryje sa hneď po kliku, server si to dobehne na pozadí. */
export function CooperationNotice() {
  const [dismissed, setDismissed] = useState(false);
  const [, startTransition] = useTransition();

  if (dismissed) return null;

  return (
    <div className={styles.cooperationNotice} role="status">
      <button
        type="button"
        className={styles.cooperationNoticeClose}
        aria-label="Zavrieť upozornenie"
        onClick={() => {
          setDismissed(true);
          startTransition(() => {
            dismissCooperationNoticeAction();
          });
        }}
      >
        <CloseIcon />
      </button>
      <p className={styles.cooperationNoticeTitle}>Spolupráca s trénerom bola ukončená</p>
      <p className={styles.cooperationNoticeText}>
        Tvoje tréningy, výživa, denník aj správy zostávajú uložené — spolupráca sa dá kedykoľvek
        obnoviť. Dovtedy môžeš aplikáciu používať aj samostatne.
      </p>
    </div>
  );
}
