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
      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={value}
          disabled={pending}
          style={{ marginTop: 3 }}
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
        <span>
          <strong>{t("weekly")}</strong>
          <span className={s.hint} style={{ display: "block" }}>
            {t("weeklyHint")}
          </span>
        </span>
      </label>
      {status === "saved" && (
        <p className={s.hint} role="status">
          {t("saved")}
        </p>
      )}
      {status === "failed" && (
        <p className={s.hint} role="alert">
          {t("failed")}
        </p>
      )}
    </div>
  );
}
