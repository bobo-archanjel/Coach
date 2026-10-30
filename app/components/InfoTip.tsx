"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./infoTip.module.css";

const QuestionIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M9.6 9.6a2.45 2.45 0 1 1 3.4 2.25c-.6.26-1 .8-1 1.45v.45"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="16.9" r="1" fill="currentColor" />
  </svg>
);
const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

/**
 * Vysvetľujúci text na požiadanie — namiesto odseku, ktorý tréner číta pri každej
 * návšteve stránky, len otáznik v krúžku; klik otvorí malé okno s textom. Zatvorí
 * ho ×, klik mimo alebo Escape. Okno ide cez portál do <body>, aby ho neorezal ani
 * neposunul rodič s overflow/transform (karty, hlavičky) — trigger tak môže byť
 * kdekoľvek, aj vnútri nadpisu.
 */
export function InfoTip({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className={styles.trigger}
        aria-label={`Vysvetlivka: ${title}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <QuestionIcon />
      </button>
      {open &&
        createPortal(
          <>
            <button type="button" className={styles.scrim} aria-label="Zavrieť vysvetlivku" tabIndex={-1} onClick={close} />
            <div className={styles.panel} role="dialog" aria-modal="true" aria-labelledby={titleId}>
              <div className={styles.head}>
                <p id={titleId} className={styles.title}>
                  {title}
                </p>
                <button type="button" ref={closeRef} className={styles.closeBtn} onClick={close} aria-label="Zavrieť">
                  <CloseIcon />
                </button>
              </div>
              <div className={styles.body}>{children}</div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
