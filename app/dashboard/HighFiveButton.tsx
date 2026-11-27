"use client";

import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { sendHighFiveAction } from "./highFiveActions";
import { useBilling } from "./BillingContext";
import { HIGH_FIVE_SENT_EVENT } from "@/lib/dashboard/attention";
import g from "../components/gamification.module.css";

/* Zoznam úspechov: po odoslaní high five riadok hneď zmizne (vybavené — na serveri sa už nenačíta)
   a po zmiznutí posledného sa ukáže prázdny stav. */
const FeedCtx = createContext<((id: string) => void) | null>(null);

export function FeedList({ className, total, emptyText, emptyClassName, children }: { className: string; total: number; emptyText: string; emptyClassName: string; children: ReactNode }) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const hide = (id: string) => setHidden((h) => new Set(h).add(id));
  return (
    <FeedCtx.Provider value={hide}>
      <HiddenCtx.Provider value={hidden}>
        {hidden.size >= total ? <p className={emptyClassName}>{emptyText}</p> : <ul className={className}>{children}</ul>}
      </HiddenCtx.Provider>
    </FeedCtx.Provider>
  );
}
const HiddenCtx = createContext<ReadonlySet<string>>(new Set());

export function FeedRow({ id, className, children }: { id: string; className: string; children: ReactNode }) {
  if (useContext(HiddenCtx).has(id)) return null;
  return <li className={className}>{children}</li>;
}

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
  const hideRow = useContext(FeedCtx);
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
            if (res.ok) {
              setSent(true);
              hideRow?.(achievementId);
              // zvonček hneď obnoví dáta — úspech z neho zmizne
              window.dispatchEvent(new Event(HIGH_FIVE_SENT_EVENT));
            }
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
