"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { setLocaleAction } from "@/lib/i18n/actions";
import { LOCALES, LOCALE_NAME, isLocale, type Locale } from "@/lib/i18n/locales";
import s from "./languageSelect.module.css";

/**
 * Výber jazyka appky (Nastavenia trénera, Profil klienta) — natívny <select> (na mobile
 * systémový výber), vzhľad v6. Zmena uloží cookie aj profil (setLocaleAction) a
 * router.refresh() vykreslí stránku nanovo v novom jazyku.
 */
export function LanguageSelect() {
  const locale = useLocale();
  const t = useTranslations("language");
  const router = useRouter();
  const [value, setValue] = useState<Locale>(locale);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  const change = (next: string) => {
    if (!isLocale(next) || next === value) return;
    setValue(next);
    setFailed(false);
    startTransition(async () => {
      const res = await setLocaleAction(next);
      if (res.signedIn && !res.savedToAccount) setFailed(true);
      router.refresh();
    });
  };

  return (
    <div className={s.wrap}>
      <select
        className={s.select}
        value={value}
        onChange={(e) => change(e.target.value)}
        disabled={pending}
        aria-label={t("label")}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_NAME[l]}
          </option>
        ))}
      </select>
      {failed && (
        <p className={s.error} role="alert">
          {t("saveFailed")}
        </p>
      )}
    </div>
  );
}
