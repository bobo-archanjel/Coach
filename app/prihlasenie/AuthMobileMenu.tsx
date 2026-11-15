"use client";

// Prihlásenie na mobile — burger vpravo hore s tlačidlami z hlavičky úvodnej stránky
// (Funkcie, AI, Cenník, jazyk, svetlý/tmavý režim). Na počítači je stránka bez hlavičky
// a menu sa nezobrazuje (auth.module.css).

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LanguageToggle } from "@/app/v6design/LanguageToggle";
import { ThemeToggle } from "@/app/v6design/ThemeToggle";
import styles from "./auth.module.css";

const LINKS = [
  { href: "/#funkcie", key: "features" },
  { href: "/#ai", key: "ai" },
  { href: "/#cennik", key: "pricing" },
] as const;

export function AuthMobileMenu() {
  const t = useTranslations("auth.menu");
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
    <div ref={rootRef} className={styles.mobileMenu}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.burger}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? t("close") : t("open")}
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
        <nav id={panelId} className={styles.menuPanel} aria-label={t("label")}>
          {LINKS.map(({ href, key }) => (
            <Link key={key} href={href} className={styles.menuLink} onClick={() => setOpen(false)}>
              {t(key)}
            </Link>
          ))}
          <div className={styles.menuSettings}>
            <span>{t("settings")}</span>
            <div className={styles.menuToggles}>
              <LanguageToggle />
              <ThemeToggle />
            </div>
          </div>
        </nav>
      )}
    </div>
  );
}
