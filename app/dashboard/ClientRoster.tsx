"use client";

// Klientský zoznam s hľadaním podľa mena/cieľa (feature/OnBoarding) — pri
// väčšom počte klientov 3 pevné skupiny (aktívny/ukončený/na zmazanie) už
// nestačia na rýchlu orientáciu. Čisto klientský filter nad už načítaným
// zoznamom (server komponent app/dashboard/page.tsx dopyt nerobí nanovo) —
// zoznam trénera je rádovo desiatky, nie tisíce riadkov, žiadny dopyt navyše
// sa neoplatí.

import { useMemo, useState } from "react";
import { AppLink as Link } from "../components/AppLink";
import { EmptyState } from "../components/EmptyState";
import styles from "./dashboard.module.css";

const ClientsIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.7" />
    <path d="M4 20c0-3.3 2.2-5.5 5-5.5s5 2.2 5 5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

export interface RosterItem {
  id: string;
  fullName: string;
  goal: string | null;
  /** začiatok spolupráce s týmto trénerom (clients.paired_at, 0047) */
  since: string;
  unread: number;
  pendingDeletion: boolean;
  deletionLabel: string | null;
  ended: boolean;
  statusLabel: string | null;
  statusTone: "active" | "late" | null;
  /** Optimistic UI (useOptimistic v ClientsBoard) — karta zobrazená hneď po odoslaní
   * formulára, kým server ešte nepotvrdil zápis. Nemá reálne `id`, takže neklika. */
  pending?: boolean;
}

/** Zbaví diakritiky pre tolerantnejšie hľadanie ("stastie" nájde "šťastie"). */
function normalize(s: string): string {
  return s
    .toLocaleLowerCase("sk")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const SEARCH_THRESHOLD = 5; // pod týmto počtom klientov je hľadanie zbytočný šum navyše

export function ClientRoster({ items }: { items: RosterItem[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return items;
    return items.filter((c) => normalize(c.fullName).includes(q) || (c.goal && normalize(c.goal).includes(q)));
  }, [items, query]);

  return (
    <>
      {items.length > SEARCH_THRESHOLD && (
        <div className={styles.rosterSearch}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Hľadať podľa mena alebo cieľa…"
            className={styles.rosterSearchInput}
            aria-label="Hľadať klienta"
          />
        </div>
      )}

      {filtered.length > 0 ? (
        <div className={styles.roster}>
          {filtered.map((client) => {
            const cardClassName = `${styles.clientCard} ${
              client.pendingDeletion ? styles.clientCardPendingDeletion : client.ended ? styles.clientCardEnded : ""
            } ${client.pending ? styles.clientCardPending : ""}`;
            const cardContent = (
              <>
                <div>
                  <div className={styles.clientName}>{client.fullName}</div>
                  {client.goal && <div className={styles.clientGoal}>{client.goal}</div>}
                </div>
                <span className={styles.clientMeta}>
                  {client.pending ? (
                    <span className={styles.statusChip}>pridávam…</span>
                  ) : (
                    <>
                      {client.unread > 0 && (
                        <span className={styles.unreadPill} title={`${client.unread} neprečítaných správ`}>
                          {client.unread} {client.unread === 1 ? "správa" : client.unread >= 2 && client.unread <= 4 ? "správy" : "správ"}
                        </span>
                      )}
                      {client.pendingDeletion ? (
                        <span className={styles.deletionChip}>Zmaže sa {client.deletionLabel}</span>
                      ) : client.ended ? (
                        <span className={`${styles.statusChip} ${styles.ended}`}>spolupráca ukončená</span>
                      ) : (
                        client.statusLabel && (
                          <span className={`${styles.statusChip} ${styles[client.statusTone ?? "active"]}`}>
                            {client.statusLabel}
                          </span>
                        )
                      )}
                    </>
                  )}
                  <span className={styles.clientSince}>od {new Date(client.since).toLocaleDateString("sk-SK")}</span>
                </span>
              </>
            );
            // Optimistická karta (feature/navod) nemá reálne DB id — kým server
            // zápis nepotvrdí, nedá sa na ňu klikať (404 na neexistujúci detail).
            return client.pending ? (
              <div key={client.id} className={cardClassName} aria-busy="true">
                {cardContent}
              </div>
            ) : (
              <Link key={client.id} href={`/dashboard/klienti/${client.id}`} className={cardClassName}>
                {cardContent}
              </Link>
            );
          })}
        </div>
      ) : items.length > 0 ? (
        <EmptyState
          title="Nič sa nenašlo"
          body="Skús iné meno alebo cieľ."
          action={
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQuery("")}>
              Vymazať hľadanie
            </button>
          }
        />
      ) : (
        <EmptyState
          icon={<ClientsIcon />}
          title="Zatiaľ nemáš žiadnych klientov"
          body="Pridaj prvého klienta a začni mu stavať tréningový plán aj jedálniček."
          action={
            <a href="#add-client" className="btn btn-primary btn-sm">
              + Pridať prvého klienta
            </a>
          }
        />
      )}
    </>
  );
}
