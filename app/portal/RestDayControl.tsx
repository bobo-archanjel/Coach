"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { RestState } from "@/lib/gamification/stats";
import { setRestDayAction } from "./gamificationActions";
import g from "../components/gamification.module.css";

/* „Dnes oddychujem 😴“ pod denným prstencami: aktívny odpočinok zatvorí prstenec Pohyb (nie je to tréning, nikde
   inde sa nepočíta). Ukáže sa len keď je dnes dokončený tréning vylúčený a tabuľka client_rest_days existuje
   (migrácia 0087). Dá sa vrátiť späť v ten istý deň. Server po akcii obnoví layout (oslava, ak padol posledný kruh). */
export function RestDayControl({ rest }: { rest: RestState }) {
  const t = useTranslations("gamification.daily");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!rest.available || rest.workoutToday) return null;

  const toggle = (next: boolean) => {
    setError(null);
    start(async () => {
      const res = await setRestDayAction(next);
      if (res.ok) router.refresh();
      else setError(t(res.error === "workout" ? "restWorkout" : "restError"));
    });
  };

  return (
    <div className={g.restRow} data-testid="rest-control">
      {rest.active ? (
        <>
          <span className={g.restState} aria-live="polite">
            {t("restActive")}
          </span>
          <button type="button" className={g.restBtn} onClick={() => toggle(false)} disabled={pending} data-testid="rest-undo">
            {t("restUndo")}
          </button>
        </>
      ) : (
        <button type="button" className={g.restBtn} onClick={() => toggle(true)} disabled={pending} data-testid="rest-button">
          <span>{t("restButton")}</span>
        </button>
      )}
      {error && (
        <p className={g.restError} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
