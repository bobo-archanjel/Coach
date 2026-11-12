"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { setLocaleAction } from "@/lib/i18n/actions";
import { LOCALES, LOCALE_NAME, LOCALE_SHORT, type Locale } from "@/lib/i18n/locales";
import s from "./languageToggle.module.css";

/**
 * Jazyk na úvodnej stránke — okrúhle tlačidlo „SK“/„CZ“ vedľa ikony svetlý/tmavý režim,
 * rovnako veľké ako ThemeToggle. Ťuk otvorí malé menu s jazykmi; voľba sa uloží do
 * cookie (setLocaleAction) a platí aj na prihlásení a v appke.
 */
export function LanguageToggle() {
  const locale = useLocale();
  const t = useTranslations("language");
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
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

  const choose = (next: Locale) => {
    setOpen(false);
    if (next === locale) return;
    startTransition(async () => {
      await setLocaleAction(next);
      router.refresh();
    });
  };

  return (
    <div ref={rootRef} className={s.root}>
      <button
        type="button"
        className={s.toggle}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t("toggle")} (${LOCALE_NAME[locale]})`}
        title={t("toggle")}
        disabled={pending}
      >
        {LOCALE_SHORT[locale]}
      </button>
      {open && (
        <div className={s.menu} role="menu" aria-label={t("label")}>
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              role="menuitemradio"
              aria-checked={l === locale}
              lang={l}
              className={`${s.item} ${l === locale ? s.itemOn : ""}`}
              onClick={() => choose(l)}
            >
              <span className={s.short}>{LOCALE_SHORT[l]}</span>
              {LOCALE_NAME[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
