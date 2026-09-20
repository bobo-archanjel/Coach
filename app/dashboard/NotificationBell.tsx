"use client";

// Zvonček upozornení trénera (feature/funkcionalita) — jeden pohľad na to, čo
// dnes potrebuje pozornosť (neprečítané správy, meškajúci klienti, týždenný
// digest). Skladanie a definície sú v lib/dashboard/attention.ts a v server
// action ./attention/actions.ts; táto komponenta rieši len načítavanie a zobrazenie.
//
// Načítavanie je zámerne MIMO kritickej cesty renderu: layout beží pri každej
// navigácii a meškajúci klienti sú 3 dopyty, preto odznak štartuje z
// `initialUnread` (počet, ktorý layout už má) a plné dáta sa dotiahnu po hydratácii.
// Ďalej: pri fokuse okna, otvorení panela, zmene trasy a raz za pár minút — vždy
// s throttlom, aby navigovanie po dashboarde nespúšťalo dopyt pri každom kliku —
// a okamžite pri novej správe (Supabase Realtime, RLS-scoped, migrácia 0033).

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { attentionTotal, buildAttentionItems, type AttentionData } from "@/lib/dashboard/attention";
import { getAttentionAction } from "./attention/actions";
import styles from "./dashboard.module.css";

const BellIcon = () => (
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

const POLL_MS = 5 * 60_000;
const REALTIME_DEBOUNCE_MS = 1_500;

export function NotificationBell({ initialUnread = 0 }: { initialUnread?: number }) {
  const pathname = usePathname();
  const [data, setData] = useState<AttentionData | null>(null);
  const [failed, setFailed] = useState(false);
  // Panel je "otvorený na tejto trase" — po navigácii sa sám zavrie bez efektu.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const lastFetch = useRef(0);
  const inFlight = useRef(false);

  const refresh = useCallback(async (minAgeMs: number) => {
    if (inFlight.current || Date.now() - lastFetch.current < minAgeMs) return;
    inFlight.current = true;
    try {
      const result = await getAttentionAction();
      if (result) {
        setData(result);
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

    let debounce: number | undefined;
    const channel = createClient()
      .channel("bell-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        window.clearTimeout(debounce);
        debounce = window.setTimeout(() => void refresh(0), REALTIME_DEBOUNCE_MS);
      })
      .subscribe();

    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
      window.clearTimeout(debounce);
      void channel.unsubscribe();
    };
  }, [refresh]);

  // zmena trasy = tréner mohol niečo vybaviť (prečítať správy, ...) — s throttlom
  useEffect(() => {
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

  const total = data ? attentionTotal(data) : initialUnread;
  const items = data ? buildAttentionItems(data) : [];

  return (
    <div className={styles.bell} ref={rootRef}>
      <button
        type="button"
        ref={buttonRef}
        className={`${styles.bellBtn} ${open ? styles.bellBtnOpen : ""}`}
        aria-expanded={open}
        aria-controls="attention-panel"
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
        <div id="attention-panel" className={styles.bellPanel} role="region" aria-label="Upozornenia">
          <p className={styles.bellPanelTitle}>Čo potrebuje tvoju pozornosť</p>

          {data === null ? (
            <p className={styles.bellEmpty}>{failed ? "Upozornenia sa nepodarilo načítať." : "Načítavam…"}</p>
          ) : items.length === 0 ? (
            <p className={styles.bellEmpty}>Všetko vybavené — nič nečaká na tvoju reakciu.</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className={styles.bellItem}>
                <Link
                  href={item.href}
                  className={`${styles.bellItemMain} ${item.tone === "alert" ? styles.bellToneAlert : styles.bellToneWatch}`}
                >
                  {item.title}
                </Link>
                {item.links.length > 0 && (
                  <ul className={styles.bellLinks}>
                    {item.links.map((l) => (
                      <li key={l.href + l.label}>
                        <Link href={l.href}>{l.label}</Link>
                        {l.meta && <span>{l.meta}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
