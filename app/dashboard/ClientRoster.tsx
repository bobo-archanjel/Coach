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
  /** tréningové plány trénera pre klienta (bez skrytých kópií úprav, 0071) */
  planCount?: number;
  /** jedálničky trénera pre klienta */
  mealPlanCount?: number;
  /** dni od posledného tréningu; null = ešte necvičil */
  lastWorkoutDays?: number | null;
  /** aktívny (zverejnený) plán a jeho odcvičenosť; null = žiadny zverejnený */
  activePlan?: { name: string; done: number; total: number } | null;
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
const FILTER_THRESHOLD = 3; // filtre stavov až od pár klientov

/** Stav klienta pre filter a pilulku na karte. */
type RosterCategory = "active" | "late" | "noPlan" | "ended";
function categoryOf(c: RosterItem): RosterCategory {
  if (c.ended || c.pendingDeletion) return "ended";
  if (c.statusTone === "late") return "late";
  if (c.statusTone === "active") return "active";
  return "noPlan"; // bez priradeného plánu (getLateStatusByClient ho nevracia)
}
const FILTERS: ("all" | RosterCategory)[] = ["all", "active", "late", "noPlan", "ended"];

/** Iniciály z mena (max 2 písmená) a stabilný odtieň avatara podľa mena. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toLocaleUpperCase("sk");
}
function toneOf(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 6;
}
/** celé mesiace od začiatku spolupráce */
function monthsSince(iso: string): number {
  const from = new Date(iso);
  const now = new Date();
  return Math.max(0, (now.getFullYear() - from.getFullYear()) * 12 + now.getMonth() - from.getMonth() - (now.getDate() < from.getDate() ? 1 : 0));
}

const PlanIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);
const MealIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 11h16a8 8 0 0 1-16 0ZM8 7c0-1.5 1-2 1-3.5M12 7c0-1.5 1-2 1-3.5M16 7c0-1.5 1-2 1-3.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ClockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.9" />
    <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function ClientRoster({ items }: { items: RosterItem[] }) {
  const t = useTranslations("clients");
  const tc = useTranslations("clients.card");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | RosterCategory>("all");
  // „N správ“: čísla zo servera, kým zvonček nenačíta novšie — potom naživo (nová správa, prečítané)
  const liveByClient = useLiveUnread(items)?.byClient ?? null;

  const counts = useMemo(() => {
    const c: Record<"all" | RosterCategory, number> = { all: 0, active: 0, late: 0, noPlan: 0, ended: 0 };
    for (const item of items) {
      if (item.pending) continue;
      c.all++;
      c[categoryOf(item)]++;
    }
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return items.filter(
      (c) =>
        (filter === "all" || c.pending || categoryOf(c) === filter) &&
        (!q || normalize(c.fullName).includes(q) || (c.goal && normalize(c.goal).includes(q))),
    );
  }, [items, query, filter]);

  const lastWorkout = (days: number | null | undefined) =>
    days == null ? tc("lastNever") : days === 0 ? tc("lastToday") : days === 1 ? tc("lastYesterday") : tc("lastDays", { count: days });

  return (
    <>
      {(items.length > SEARCH_THRESHOLD || counts.all >= FILTER_THRESHOLD) && (
        <div className={styles.ccToolbar}>
          {items.length > SEARCH_THRESHOLD && (
            <div className={styles.rosterSearch} data-tour="clients-search">
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
          {counts.all >= FILTER_THRESHOLD && (
            <div className={styles.ccFilters} role="radiogroup" aria-label={tc("filtersAria")} data-no-swipe>
              {FILTERS.filter((f) => f === "all" || counts[f] > 0).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={filter === f}
                  className={styles.ccFilter}
                  onClick={() => setFilter(f)}
                >
                  {tc(`filter.${f}`)}
                  <span className={styles.ccFilterCount}>{counts[f]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {filtered.length > 0 ? (
        <div className={styles.ccGrid}>
          {filtered.map((client) => {
            const unread = liveByClient ? (liveByClient.get(client.id) ?? 0) : client.unread;
            const category = categoryOf(client);
            const muted = client.ended || client.pendingDeletion;
            const months = monthsSince(client.since);
            const plan = client.activePlan;
            const planPct = plan && plan.total > 0 ? Math.round((plan.done / plan.total) * 100) : 0;
            const planDone = Boolean(plan && plan.total > 0 && plan.done >= plan.total);
            const statusChip = client.pending ? (
              <span className={styles.statusChip}>{t("adding")}</span>
            ) : client.pendingDeletion ? (
              <span className={styles.deletionChip}>{t("deletesOn", { date: client.deletionLabel ?? "" })}</span>
            ) : client.ended ? (
              <span className={`${styles.statusChip} ${styles.ended}`}>{t("ended")}</span>
            ) : category === "noPlan" ? (
              <span className={`${styles.statusChip} ${styles.ended}`}>{tc("noPlan")}</span>
            ) : (
              <span className={`${styles.statusChip} ${styles[category === "late" ? "late" : "active"]}`}>{client.statusLabel}</span>
            );

            return (
              <article
                key={client.id}
                className={`${styles.ccCard} ${muted ? styles.ccCardMuted : ""} ${client.pending ? styles.clientCardPending : ""}`}
                data-tour={client.pending ? undefined : "clients-card"}
                data-category={category}
                // odtieň avatara (podľa mena) — farbí aj jemný prechod v hornej časti karty
                data-tone={toneOf(client.fullName)}
                aria-busy={client.pending || undefined}
              >
                <div className={styles.ccHead}>
                  <span className={styles.ccAvatar} aria-hidden="true">
                    {initials(client.fullName)}
                  </span>
                  <div className={styles.ccIdentity}>
                    {client.pending ? (
                      <div className={styles.ccName}>{client.fullName}</div>
                    ) : (
                      // Celá karta je klikateľná cez neviditeľný prekryv odkazu (::after) — odkaz na
                      // chat (odznak správ) tak nemusí byť vnorený v odkaze na detail (neplatné HTML).
                      <Link href={`/dashboard/klienti/${client.id}`} className={`${styles.ccName} ${styles.clientCardLink}`}>
                        {client.fullName}
                      </Link>
                    )}
                    {client.goal && <div className={styles.ccGoal}>{client.goal}</div>}
                  </div>
                  <div className={styles.ccBadges}>
                    {statusChip}
                    {unread > 0 && !client.pending && (
                      // odznak správ → rovno vlákno s klientom v Správach (ako vo zvončeku)
                      <Link
                        href={`/dashboard/spravy?client=${encodeURIComponent(client.id)}`}
                        className={`${styles.unreadPill} ${styles.unreadPillLink}`}
                        data-tour="clients-unread"
                        title={t("unreadTitle", { count: unread })}
                      >
                        {t("unreadPill", { count: unread })}
                      </Link>
                    )}
                  </div>
                </div>

                {!client.pending && (
                  <>
                    <dl className={styles.ccStats}>
                      <div className={styles.ccStat}>
                        <dt>
                          <PlanIcon />
                          {tc("plans", { count: client.planCount ?? 0 })}
                        </dt>
                        <dd>{client.planCount ?? 0}</dd>
                      </div>
                      <div className={styles.ccStat}>
                        <dt>
                          <MealIcon />
                          {tc("mealPlans", { count: client.mealPlanCount ?? 0 })}
                        </dt>
                        <dd>{client.mealPlanCount ?? 0}</dd>
                      </div>
                      <div className={styles.ccStat}>
                        <dt>
                          <ClockIcon />
                          {tc("lastWorkout")}
                        </dt>
                        <dd className={styles.ccStatText}>{lastWorkout(client.lastWorkoutDays)}</dd>
                      </div>
                    </dl>

                    {!muted && (
                      <div className={styles.ccPlan} data-testid="client-plan-progress">
                        {plan ? (
                          <>
                            <div className={styles.ccPlanTop}>
                              <span className={styles.ccPlanName}>{plan.name}</span>
                              <span className={styles.ccPlanCount}>
                                {planDone ? tc("planDone") : tc("planProgress", { done: plan.done, total: plan.total })}
                              </span>
                            </div>
                            <div
                              className={styles.ccBar}
                              role="progressbar"
                              aria-label={tc("planProgressAria", { name: plan.name })}
                              aria-valuemin={0}
                              aria-valuemax={plan.total}
                              aria-valuenow={plan.done}
                              data-done={planDone || undefined}
                            >
                              <span style={{ width: `${planPct}%` }} />
                            </div>
                          </>
                        ) : (
                          <span className={styles.ccPlanEmpty}>
                            {(client.planCount ?? 0) > 0 ? tc("planDraftOnly") : tc("planNone")}
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}

                <div className={styles.ccFoot}>
                  {tc("since", { date: new Date(client.since).toLocaleDateString(intlLocale(locale)) })}
                  {!client.pending && (
                    <span className={styles.ccDuration}>
                      {" · "}
                      {months === 0 ? tc("durationNew") : tc("durationMonths", { count: months })}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : items.length > 0 ? (
        <EmptyState
          title={t("noMatchTitle")}
          body={t("noMatchText")}
          action={
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
            >
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
