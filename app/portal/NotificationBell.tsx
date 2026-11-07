"use client";

// Zvonček upozornení klienta (feature/AIupgrade) — mirror app/dashboard/
// NotificationBell.tsx (tréner). Jeden pohľad na to, čo klient potrebuje vidieť:
// neprečítané správy od trénera (vrátane AI proaktívneho check-inu, sender
// 'system'), nové/zverejnené plány a jedálničky, blížiace sa termíny. Skladanie
// a definície sú v lib/portal/attention.ts a lib/portal/attentionData.ts
// (GET /api/portal/attention); táto komponenta rieši len načítavanie a zobrazenie.
//
// Rovnaké správanie ako trénerov zvonček: initialUnread z layoutu (bez čakania
// na plné dáta), refresh pri fokuse/otvorení/zmene trasy/intervale, a okamžite
// pri novej správe cez Supabase Realtime (RLS-scoped).

import { useCallback, useEffect, useRef, useState } from "react";
import { AppLink as Link } from "../components/AppLink";
import { usePathname } from "next/navigation";
import {
  applyPortalDismissals,
  portalAttentionTotal,
  buildPortalAttentionItems,
  type PortalAttentionData,
} from "@/lib/portal/attention";
import { dismissPortalNotificationsAction, markAllPortalMessagesReadAction } from "./attention/actions";
import portalModule from "./portal.module.css";
import { useSkinStyles } from "@/app/components/uiSkin";

function BellIcon() {
  const styles = useSkinStyles("portal", portalModule);
  return (
    <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15L6 16.5ZM10 20.5a2 2 0 0 0 4 0"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const POLL_MS = 5 * 60_000;
const REALTIME_DEBOUNCE_MS = 1_500;

/** Poradie Realtime kanálov — unikátny topic na mount (viď ChatThread, rovnaký dôvod). */
let channelSeq = 0;

export function NotificationBell({ initialUnread = 0 }: { initialUnread?: number }) {
  const styles = useSkinStyles("portal", portalModule);
  const pathname = usePathname();
  const [data, setData] = useState<PortalAttentionData | null>(null);
  const [failed, setFailed] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const lastFetch = useRef(0);
  const inFlight = useRef(false);
  const pendingDismiss = useRef<{ keys: string[]; days: number | null } | null>(null);
  const localDismissed = useRef(new Set<string>());
  const markReadPending = useRef(false);

  const refresh = useCallback(async (minAgeMs: number) => {
    if (inFlight.current || Date.now() - lastFetch.current < minAgeMs) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/portal/attention", { cache: "no-store" });
      const result = res.ok ? ((await res.json()) as { data: PortalAttentionData | null }).data : null;
      if (result) {
        const view = applyPortalDismissals(result, localDismissed.current);
        setData(markReadPending.current ? { ...view, unread: 0 } : view);
        setFailed(false);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      lastFetch.current = Date.now();
      inFlight.current = false;
    }
  }, []);

  // úvodné načítanie + fokus okna + pomalý interval + Realtime nová správa
  useEffect(() => {
    void refresh(0);
    const onFocus = () => {
      if (document.visibilityState === "visible") void refresh(30_000);
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(() => void refresh(60_000), POLL_MS);

    // Len správy OD trénera/systému — vlastné odoslané správy klienta upozornenia nemenia.
    let alive = true;
    let debounce: number | undefined;
    let removeChannel: (() => void) | null = null;
    void import("@/lib/supabase/client").then(({ createClient }) => {
      if (!alive) return;
      const supabase = createClient();
      const channel = supabase
        .channel(`portal-bell-messages-${++channelSeq}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "sender=eq.trainer" }, () => {
          window.clearTimeout(debounce);
          debounce = window.setTimeout(() => void refresh(0), REALTIME_DEBOUNCE_MS);
        })
        .subscribe();
      removeChannel = () => void supabase.removeChannel(channel);
    });

    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
      window.clearTimeout(debounce);
      removeChannel?.();
    };
  }, [refresh]);

  // zmena trasy = klient mohol niečo vybaviť (otvoril plán, ...) — s throttlom.
  useEffect(() => {
    const pending = pendingDismiss.current;
    if (pending) {
      pendingDismiss.current = null;
      const undo = () => {
        for (const k of pending.keys) localDismissed.current.delete(k);
        setActionFailed(true);
      };
      void dismissPortalNotificationsAction(pending.keys, pending.days, false)
        .then((r) => {
          if (!r.ok) undo();
        })
        .catch(undo);
    }
    void refresh(30_000);
  }, [pathname, refresh]);

  // Escape a klik mimo zatvoria panel
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenAt(null);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenAt(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const total = data ? portalAttentionTotal(data) : initialUnread;
  const items = data ? buildPortalAttentionItems(data) : [];

  const dismiss = useCallback(
    (keys: string[], days: number | null) => {
      const gone = new Set(keys);
      for (const k of keys) localDismissed.current.add(k);
      const fail = () => {
        for (const k of keys) localDismissed.current.delete(k);
        setActionFailed(true);
        void refresh(0);
      };
      setActionFailed(false);
      setData((d) => (d ? applyPortalDismissals(d, gone) : d));
      void dismissPortalNotificationsAction(keys, days)
        .then((r) => {
          if (!r.ok) fail();
        })
        .catch(fail);
    },
    [refresh],
  );

  const dismissOnOpen = useCallback(
    (href: string, keys: string[], days: number | null) => {
      if (href === pathname) {
        dismiss(keys, days);
        return;
      }
      setActionFailed(false);
      for (const k of keys) localDismissed.current.add(k);
      setData((d) => (d ? applyPortalDismissals(d, new Set(keys)) : d));
      pendingDismiss.current = { keys, days };
    },
    [pathname, dismiss],
  );

  const markRead = useCallback(() => {
    const fail = () => {
      setActionFailed(true);
      void refresh(0);
    };
    setActionFailed(false);
    markReadPending.current = true;
    setData((d) => (d ? { ...d, unread: 0 } : d));
    void markAllPortalMessagesReadAction()
      .then((r) => {
        markReadPending.current = false;
        if (!r.ok) fail();
      })
      .catch(() => {
        markReadPending.current = false;
        fail();
      });
  }, [refresh]);

  return (
    <div className={styles.bell} ref={rootRef}>
      <button
        type="button"
        ref={buttonRef}
        className={`${styles.bellBtn} ${open ? styles.bellBtnOpen : ""}`}
        aria-expanded={open}
        aria-controls="portal-attention-panel"
        aria-label={total > 0 ? `Upozornenia, ${total}` : "Upozornenia"}
        onClick={() => {
          if (!open) void refresh(15_000);
          setOpenAt(open ? null : pathname);
        }}
      >
        <BellIcon />
        {total > 0 && <span className={styles.bellBadge}>{total > 9 ? "9+" : total}</span>}
      </button>

      {open && (
        <div id="portal-attention-panel" className={styles.bellPanel} role="region" aria-label="Upozornenia">
          <p className={styles.bellPanelTitle}>Čo je nové</p>

          {data === null ? (
            <p className={styles.bellEmpty}>{failed ? "Upozornenia sa nepodarilo načítať." : "Načítavam…"}</p>
          ) : items.length === 0 ? (
            <p className={styles.bellEmpty}>Nič nové — všetko si videl/videla.</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className={styles.bellItem}>
                <div className={styles.bellItemHead}>
                  {item.href ? (
                    <Link
                      href={item.href}
                      className={`${styles.bellItemMain} ${item.tone === "alert" ? styles.bellToneAlert : styles.bellToneWatch}`}
                    >
                      {item.title}
                    </Link>
                  ) : (
                    <span className={`${styles.bellItemMain} ${item.tone === "alert" ? styles.bellToneAlert : styles.bellToneWatch}`}>
                      {item.title}
                    </span>
                  )}
                  {item.markRead && (
                    <button type="button" className={styles.bellAction} onClick={markRead}>
                      Označiť ako prečítané
                    </button>
                  )}
                  {item.dismiss && (
                    <button
                      type="button"
                      className={styles.bellAction}
                      onClick={() => dismiss(item.dismiss!.keys, item.dismiss!.days)}
                    >
                      {item.dismiss.keys.length > 1 ? "Skryť všetky" : "Skryť"}
                    </button>
                  )}
                </div>
                {item.links.length > 0 && (
                  <ul className={styles.bellLinks}>
                    {item.links.map((l) => (
                      <li key={l.href + l.label}>
                        <Link
                          href={l.href}
                          onClick={l.dismissKey ? () => dismissOnOpen(l.href, [l.dismissKey!], item.dismiss?.days ?? null) : undefined}
                        >
                          {l.label}
                        </Link>
                        {l.meta && <span>{l.meta}</span>}
                        {l.dismissKey && (
                          <button
                            type="button"
                            className={styles.bellX}
                            aria-label={`Skryť ${l.label}`}
                            onClick={() => dismiss([l.dismissKey!], item.dismiss?.days ?? null)}
                          >
                            ×
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))
          )}
          {actionFailed && (
            <p className={styles.bellError} role="alert">
              Nepodarilo sa uložiť. Skús to znova o chvíľu.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
