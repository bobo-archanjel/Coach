"use client";

// Skrývateľné upozornenia na hlavnej ploche /dashboard (feature/funkcionalita) —
// tie isté, čo zvonček, nech nič "nesvieti" donekonečna. Kľúče a pravidlá skrytia
// sú v lib/dashboard/attention.ts, ukladanie v ./attention/actions.ts (migrácia 0035).
// Skrytie je OPTIMISTICKÉ: blok zmizne hneď, ak server zlyhá, vráti sa späť.

import { useState, type ReactNode } from "react";
import Link from "next/link";
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
  if (hidden) return null;

  return (
    <div className={`${className ?? ""} ${styles.noticeWrap}`} role="status">
      {children}
      <button
        type="button"
        className={styles.noticeClose}
        aria-label={label}
        title={label}
        onClick={() => {
          setHidden(true);
          void dismissNotificationsAction([dismissKey], days)
            .then((r) => {
              if (!r.ok) setHidden(false);
            })
            .catch(() => setHidden(false));
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
  const visible = clients.filter((c) => !hiddenKeys.has(c.key));
  if (visible.length === 0) return null;

  function hide(keys: string[]) {
    setHiddenKeys((prev) => new Set([...prev, ...keys]));
    void dismissNotificationsAction(keys, DISMISS_LATE_DAYS)
      .then((r) => {
        if (!r.ok) setHiddenKeys((prev) => new Set([...prev].filter((k) => !keys.includes(k))));
      })
      .catch(() => setHiddenKeys((prev) => new Set([...prev].filter((k) => !keys.includes(k)))));
  }

  const n = visible.length;
  return (
    <div className={styles.alertPanel} role="status">
      <div className={styles.alertPanelHead}>
        <p className={styles.alertPanelTitle}>
          {n === 1 ? "1 klient mešká s tréningom" : `${n} klienti meškajú s tréningom`}
        </p>
        {n > 1 && (
          <button
            type="button"
            className={styles.alertPanelAction}
            title={`Skryje na ${DISMISS_LATE_DAYS} dní, potom sa vrátia, ak stále meškajú.`}
            onClick={() => hide(visible.map((c) => c.key))}
          >
            Skryť všetky
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
              aria-label={`Skryť ${c.name} na ${DISMISS_LATE_DAYS} dní`}
              title={`Skryť na ${DISMISS_LATE_DAYS} dní`}
              onClick={() => hide([c.key])}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
