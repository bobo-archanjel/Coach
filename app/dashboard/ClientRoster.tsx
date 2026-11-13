"use client";

import { useLocale, useTranslations } from "next-intl";
import { intlLocale } from "@/lib/i18n/locales";
// Klientský zoznam s hľadaním podľa mena/cieľa (feature/OnBoarding) — pri
// väčšom počte klientov 3 pevné skupiny (aktívny/ukončený/na zmazanie) už
// nestačia na rýchlu orientáciu. Čisto klientský filter nad už načítaným
// zoznamom (server komponent app/dashboard/page.tsx dopyt nerobí nanovo) —
// zoznam trénera je rádovo desiatky, nie tisíce riadkov, žiadny dopyt navyše
// sa neoplatí.

import { useMemo, useState } from "react";
import { AppLink as Link } from "../components/AppLink";
import { EmptyState } from "../components/EmptyState";
import { useLiveUnread } from "../components/liveUnread";
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
  const t = useTranslations("clients");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  // „N správ“: čísla zo servera, kým zvonček nenačíta novšie — potom naživo (nová správa, prečítané)
  const liveByClient = useLiveUnread(items)?.byClient ?? null;

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
            placeholder={t("searchPlaceholder")}
            className={styles.rosterSearchInput}
            aria-label={t("search")}
          />
        </div>
      )}

      {filtered.length > 0 ? (
        <div className={styles.roster}>
          {filtered.map((client) => {
            const unread = liveByClient ? (liveByClient.get(client.id) ?? 0) : client.unread;
            const cardClassName = `${styles.clientCard} ${
              client.pendingDeletion ? styles.clientCardPendingDeletion : client.ended ? styles.clientCardEnded : ""
            } ${client.pending ? styles.clientCardPending : ""}`;
            const cardContent = (
              <>
                <div>
                  {client.pending ? (
                    <div className={styles.clientName}>{client.fullName}</div>
                  ) : (
                    // Celá karta je klikateľná cez neviditeľný prekryv odkazu (::after) — odkaz na
                    // chat (odznak správ) tak nemusí byť vnorený v odkaze na detail (neplatné HTML).
                    <Link href={`/dashboard/klienti/${client.id}`} className={`${styles.clientName} ${styles.clientCardLink}`}>
                      {client.fullName}
                    </Link>
                  )}
                  {client.goal && <div className={styles.clientGoal}>{client.goal}</div>}
                </div>
                <span className={`${styles.clientMeta} ${styles.rosterMeta}`}>
                  {client.pending ? (
                    <span className={styles.statusChip}>{t("adding")}</span>
                  ) : (
                    <>
                      {unread > 0 && (
                        // odznak správ → rovno vlákno s klientom v Správach (ako vo zvončeku)
                        <Link
                          href={`/dashboard/spravy?client=${encodeURIComponent(client.id)}`}
                          className={`${styles.unreadPill} ${styles.unreadPillLink}`}
                          title={t("unreadTitle", { count: unread })}
                        >
                          {t("unreadPill", { count: unread })}
                        </Link>
                      )}
                      {client.pendingDeletion ? (
                        <span className={styles.deletionChip}>{t("deletesOn", { date: client.deletionLabel ?? "" })}</span>
                      ) : client.ended ? (
                        <span className={`${styles.statusChip} ${styles.ended}`}>{t("ended")}</span>
                      ) : (
                        client.statusLabel && (
                          <span className={`${styles.statusChip} ${styles[client.statusTone ?? "active"]}`}>
                            {client.statusLabel}
                          </span>
                        )
                      )}
                    </>
                  )}
                  <span className={styles.clientSince}>
                    {t("since", { date: new Date(client.since).toLocaleDateString(intlLocale(locale)) })}
                  </span>
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
              <div key={client.id} className={`${cardClassName} ${styles.clientCardStretched}`}>
                {cardContent}
              </div>
            );
          })}
        </div>
      ) : items.length > 0 ? (
        <EmptyState
          title={t("noMatchTitle")}
          body={t("noMatchText")}
          action={
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQuery("")}>
              {t("clearSearch")}
            </button>
          }
        />
      ) : (
        <EmptyState
          icon={<ClientsIcon />}
          title={t("emptyTitle")}
          body={t("emptyText")}
          action={
            <a href="#add-client" className="btn btn-primary btn-sm">
              {t("addFirst")}
            </a>
          }
        />
      )}
    </>
  );
}
