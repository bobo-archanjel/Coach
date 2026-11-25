"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { sendHighFiveAction } from "./highFiveActions";
import { useBilling } from "./BillingContext";
import g from "../components/gamification.module.css";

/* Jedno ťuknutie = „high five“ klientovi za rekord/odznak. Server akcia overí predplatné
   (read-only tréner nič neodošle), vlastníctvo klienta a jedinečnosť (jeden high five na úspech). */
export function HighFiveButton({
  achievementId,
  clientName,
  what,
  done = false,
}: {
  achievementId: string;
  clientName: string;
  what: string;
  done?: boolean;
}) {
  const t = useTranslations("gamification.trainer");
  const [sent, setSent] = useState(done);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // len zobrazenie — vynútenie je na serveri (trainerBlock v sendHighFiveAction)
  const readOnly = useBilling().readOnly;

  if (sent) {
    return (
      <span className={`${g.fiveBtn} ${g.fiveDone}`} role="status" aria-label={t("sentAria", { client: clientName })}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M2.5 7.5l3 3 6-6.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {t("sent")}
      </span>
    );
  }
  return (
    <span>
      <button
        type="button"
        className={g.fiveBtn}
        disabled={pending || readOnly}
        title={readOnly ? t("readOnly") : undefined}
        aria-label={t("sendAria", { client: clientName, what })}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await sendHighFiveAction(achievementId);
            if (res.ok) setSent(true);
            else setError(res.error);
          })
        }
      >
        {pending ? t("sending") : t("send")}
      </button>
      {error && (
        <span className={g.fiveError} role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
