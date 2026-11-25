"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { setWeeklyEmailAction } from "./emailActions";
import s from "../portal.module.css";

/* Profil klienta → „E-maily“: prepínač týždenného zhrnutia e-mailom (predvolene zapnuté). */
export function EmailPrefs({ weeklyEnabled }: { weeklyEnabled: boolean }) {
  const t = useTranslations("profile.emailPrefs");
  const [value, setValue] = useState(weeklyEnabled);
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  const [pending, start] = useTransition();

  return (
    <div className={s.panel} data-testid="email-prefs">
      <p className={s.panelLabel}>{t("title")}</p>
      <label className={s.prefRow}>
        <span className={s.prefText}>
          <span className={s.prefTitle}>{t("weekly")}</span>
          <span className={s.prefHint}>{t("weeklyHint")}</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className={s.prefSwitch}
          checked={value}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.checked;
            setValue(next);
            setStatus("idle");
            start(async () => {
              const res = await setWeeklyEmailAction(next);
              if (!res.ok) {
                setValue(!next);
                setStatus("failed");
              } else setStatus("saved");
            });
          }}
        />
      </label>
      {status === "saved" && (
        <p className={s.prefStatus} role="status">
          {t("saved")}
        </p>
      )}
      {status === "failed" && (
        <p className={s.prefStatus} role="alert">
          {t("failed")}
        </p>
      )}
    </div>
  );
}
