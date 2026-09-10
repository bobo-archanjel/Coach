"use client";

// Klientský zoznam s hľadaním podľa mena/cieľa (feature/OnBoarding) — pri
// väčšom počte klientov 3 pevné skupiny (aktívny/ukončený/na zmazanie) už
// nestačia na rýchlu orientáciu. Čisto klientský filter nad už načítaným
// zoznamom (server komponent app/dashboard/page.tsx dopyt nerobí nanovo) —
// zoznam trénera je rádovo desiatky, nie tisíce riadkov, žiadny dopyt navyše
// sa neoplatí.

import { useMemo, useState } from "react";
import Link from "next/link";
import styles from "./dashboard.module.css";

export interface RosterItem {
  id: string;
  fullName: string;
  goal: string | null;
  createdAt: string;
  unread: number;
  pendingDeletion: boolean;
  deletionLabel: string | null;
  ended: boolean;
  statusLabel: string | null;
  statusTone: "active" | "late" | null;
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
          {filtered.map((client) => (
            <Link
              key={client.id}
              href={`/dashboard/klienti/${client.id}`}
              className={`${styles.clientCard} ${
                client.pendingDeletion ? styles.clientCardPendingDeletion : client.ended ? styles.clientCardEnded : ""
              }`}
            >
              <div>
                <div className={styles.clientName}>{client.fullName}</div>
                {client.goal && <div className={styles.clientGoal}>{client.goal}</div>}
              </div>
              <span className={styles.clientMeta}>
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
                <span className={styles.clientSince}>od {new Date(client.createdAt).toLocaleDateString("sk-SK")}</span>
              </span>
            </Link>
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className={styles.emptyState}>
          <h2>Nič sa nenašlo</h2>
          <p>Skús iné meno alebo cieľ.</p>
        </div>
      ) : (
        <div className={styles.emptyState}>
          <h2>Zatiaľ nemáš žiadnych klientov</h2>
          <p>Pridaj prvého klienta vyššie.</p>
        </div>
      )}
    </>
  );
}
