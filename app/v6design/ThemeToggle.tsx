"use client";

import { useTranslations } from "next-intl";
import { applyV6Theme } from "./ThemeSwitch";
import s from "./themeToggle.module.css";

const SunIcon = () => (
  <svg className={s.sun} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4M18.7 18.7l-1.4-1.4M6.7 6.7 5.3 5.3"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);
const MoonIcon = () => (
  <svg className={s.moon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);

/** Práve zobrazená téma — pri „auto“ (bez voľby) podľa nastavenia zariadenia. */
function shownTheme(): "light" | "dark" {
  const set = document.querySelector("[data-v6-root]")?.getAttribute("data-theme");
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Ikona svetlý ↔ tmavý režim (landing page, hlavička vedľa „Vyskúšať zadarmo“). Ťuk prepne
 * na opačnú tému, ako je práve zobrazená, a uloží ju do cookie spoločnej s prihlásením
 * a appkou (applyV6Theme). Svetlý režim ukazuje slnko, tmavý mesiac — ktorú ikonu ukázať
 * rieši CSS podľa data-theme koreňa (aj pri „auto“ podľa zariadenia), takže server aj
 * prehliadač vykreslia to isté a ikona nepreblikne.
 */
export function ThemeToggle() {
  const t = useTranslations("theme");
  return (
    <button
      type="button"
      className={s.toggle}
      onClick={() => applyV6Theme(shownTheme() === "dark" ? "light" : "dark")}
      aria-label={t("toggle")}
      title={t("toggle")}
    >
      <SunIcon />
      <MoonIcon />
    </button>
  );
}
