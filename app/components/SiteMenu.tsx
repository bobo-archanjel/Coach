"use client";

// Úvodná stránka na mobile — burger v hlavičke s tlačidlami, ktoré sa na úzkej obrazovke
// do hlavičky nezmestia (Funkcie, AI, Cenník, Prihlásiť sa) a s jazykom a svetlým/tmavým
// režimom. Na počítači je hlavička celá a burger sa nezobrazuje (siteMenu.module.css).
// Texty posiela serverová stránka (menný priestor landing nie je v klientskych textoch).

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { LanguageToggle } from "@/app/v6design/LanguageToggle";
import { ThemeToggle } from "@/app/v6design/ThemeToggle";
import styles from "./siteMenu.module.css";

export interface SiteMenuLabels {
  open: string;
  close: string;
  label: string;
  settings: string;
}

export function SiteMenu({ items, labels }: { items: { href: string; label: string }[]; labels: SiteMenuLabels }) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !e.composedPath().includes(rootRef.current)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={styles.root}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.burger}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? labels.close : labels.open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={styles.burgerIcon}>
          {open ? (
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          )}
        </svg>
      </button>
      {open && (
        <nav id={panelId} className={styles.panel} aria-label={labels.label}>
          {items.map(({ href, label }) => (
            <Link key={href} href={href} className={styles.link} onClick={() => setOpen(false)}>
              {label}
            </Link>
          ))}
          <div className={styles.settings}>
            <span>{labels.settings}</span>
            <div className={styles.toggles}>
              <LanguageToggle />
              <ThemeToggle />
            </div>
          </div>
        </nav>
      )}
    </div>
  );
}
