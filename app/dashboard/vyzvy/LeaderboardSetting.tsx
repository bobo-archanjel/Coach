"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useBilling } from "../BillingContext";
import { setLeaderboardEnabledAction } from "./actions";
import g from "@/app/components/gamification.module.css";

/* Tréner zapne/vypne rebríček pre všetkých svojich klientov. Klienti sa v ňom môžu navyše sami skryť. */
export function LeaderboardSetting({ enabled }: { enabled: boolean }) {
  const t = useTranslations("gamification.leaderboard.trainer");
  const router = useRouter();
  const readOnly = useBilling().readOnly;
  const [value, setValue] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className={g.tcForm} data-testid="leaderboard-setting">
      <label className={g.tcRadio} style={{ alignItems: "flex-start" }}>
        <input
          type="checkbox"
          checked={value}
          disabled={pending || readOnly}
          onChange={(e) => {
            const next = e.target.checked;
            setValue(next);
            setError(null);
            start(async () => {
              const res = await setLeaderboardEnabledAction(next);
              if (res.error) {
                setValue(!next);
                setError(res.error);
              } else router.refresh();
            });
          }}
        />
        <span>
          <strong>{t("label")}</strong>
          <span className={g.tcHint} style={{ display: "block" }}>
            {t("hint")}
          </span>
        </span>
      </label>
      {error && (
        <p className={g.tcErr} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
