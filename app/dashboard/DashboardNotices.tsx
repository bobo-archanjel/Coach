"use client";

import { useTranslations } from "next-intl";
// Skrývateľné upozornenia na hlavnej ploche /dashboard (feature/funkcionalita) —
// tie isté, čo zvonček, nech nič "nesvieti" donekonečna. Kľúče a pravidlá skrytia
// sú v lib/dashboard/attention.ts, ukladanie v ./attention/actions.ts (migrácia 0035).
// Skrytie je OPTIMISTICKÉ: blok zmizne hneď, ak server zlyhá, vráti sa späť.

import { useState, type ReactNode } from "react";
import { AppLink as Link } from "../components/AppLink";
import { DISMISS_LATE_DAYS } from "@/lib/dashboard/attention";
import { dismissNotificationsAction } from "./attention/actions";
import styles from "./dashboard.module.css";


/** Jeden skrytý-alebo-nie blok (digest banner, checklist prvých krokov). */
export function DismissibleNotice({
  dismissKey,
  days = null,
  className,
  label,
  children,
}: {
  dismissKey: string;
  /** null = kým sa nezmení situácia (kľúč to rieši sám) */
  days?: number | null;
  className?: string;
  label: string;
  children: ReactNode;
}) {
  const [hidden, setHidden] = useState(false);
  const t = useTranslations("clients");
  const [failed, setFailed] = useState(false);
  if (hidden) return null;

  const fail = () => {
    setHidden(false);
    setFailed(true);
  };

  return (
    <div className={`${className ?? ""} ${styles.noticeWrap}`} role="status">
      {children}
      {failed && (
        <p className={styles.noticeError} role="alert">
          {t("hideFailed")}
        </p>
      )}
      <button
        type="button"
        className={styles.noticeClose}
        aria-label={label}
        title={label}
        onClick={() => {
          setFailed(false);
          setHidden(true);
          void dismissNotificationsAction([dismissKey], days)
            .then((r) => {
              if (!r.ok) fail();
            })
            .catch(fail);
        }}
      >
        ×
      </button>
    </div>
  );
}

export interface LateNoticeClient {
  id: string;
  name: string;
  /** "9 dní bez tréningu" */
  label: string;
  key: string;
}

/** Alert panel "meškajúci klienti" so skrytím jedného aj všetkých naraz (na 7 dní). */
export function LateAlertPanel({ clients }: { clients: LateNoticeClient[] }) {
  const [hiddenKeys, setHiddenKeys] = useState<ReadonlySet<string>>(new Set());
  const t = useTranslations("clients");
  const [failed, setFailed] = useState(false);
  const visible = clients.filter((c) => !hiddenKeys.has(c.key));
  if (visible.length === 0) return null;

  function hide(keys: string[]) {
    // Optimisticky skryté; ak server zápis odmietne, vrátime ich A povieme prečo —
    // ticho vrátené upozornenie by vyzeralo ako "tlačidlo nefunguje".
    const restore = () => {
      setHiddenKeys((prev) => new Set([...prev].filter((k) => !keys.includes(k))));
      setFailed(true);
    };
    setFailed(false);
    setHiddenKeys((prev) => new Set([...prev, ...keys]));
    void dismissNotificationsAction(keys, DISMISS_LATE_DAYS)
      .then((r) => {
        if (!r.ok) restore();
      })
      .catch(restore);
  }

  const n = visible.length;
  return (
    <div className={styles.alertPanel} role="status">
      <div className={styles.alertPanelHead}>
        <p className={styles.alertPanelTitle}>
          {t("lateTitle", { count: n })}
        </p>
        {n > 1 && (
          <button
            type="button"
            className={styles.alertPanelAction}
            title={t("lateHideAllHint", { days: DISMISS_LATE_DAYS })}
            onClick={() => hide(visible.map((c) => c.key))}
          >
            {t("hideAll")}
          </button>
        )}
      </div>
      <ul className={styles.alertPanelList}>
        {visible.map((c) => (
          <li key={c.key}>
            <Link href={`/dashboard/klienti/${c.id}`}>{c.name}</Link>
            <span>{c.label}</span>
            <button
              type="button"
              className={styles.alertPanelX}
              aria-label={t("hideClient", { name: c.name, days: DISMISS_LATE_DAYS })}
              title={t("hideForDays", { days: DISMISS_LATE_DAYS })}
              onClick={() => hide([c.key])}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {failed && (
        <p className={styles.noticeError} role="alert">
          {t("hideFailed")}
        </p>
      )}
    </div>
  );
}
