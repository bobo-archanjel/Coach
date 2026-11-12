import { getLocale, getTranslations } from "next-intl/server";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import { AppLink as Link } from "../../components/AppLink";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { getClientAnalyticsOverview, type ClientAnalyticsRow } from "@/lib/dashboard/analytics";
import { clientStatus, sortScore } from "@/lib/dashboard/portfolioStatus";
import { getRecentPRs, type StrengthPR } from "@/lib/dashboard/bodyMetrics";
import { getAiTopicInsights, type AiTopicInsight } from "@/lib/dashboard/aiInsights";
import { RosterSummaryCard } from "./RosterSummaryCard";
import { InfoTip } from "@/app/components/InfoTip";
import styles from "@/app/dashboard/dashboard.module.css";

/** Prehľad naprieč klientmi — Progres a analýza (feature/progress-analyst), rozšírené feature/analytika-v2. */

function pctTone(pct: number | null): "active" | "late" | "ended" {
  if (pct == null) return "ended";
  if (pct >= 70) return "active";
  if (pct < 40) return "late";
  return "ended";
}

/** Zoraďovacie skóre — čo najnižšie prvé (najviac potrebuje pozornosť). Priemer z dostupných %. */
/**
 * Zdravie celého portfólia — počty klientov podľa `clientStatus`, aby tréner videl
 * stav na prvý pohľad, nie len zoradený zoznam. "Bez dát" = klient, ktorý za 30 dní
 * nič neodcvičil ani nemá makro cieľ (inak by umelo napĺňal "Riziko").
 */
function portfolioHealth(rows: ClientAnalyticsRow[]): { ok: number; watch: number; risk: number; none: number } {
  const health = { ok: 0, watch: 0, risk: 0, none: 0 };
  for (const row of rows) health[clientStatus(row)]++;
  return health;
}

function dateLabel(iso: string | null, never: string, locale: Locale): string {
  if (!iso) return never;
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "dnes" / "včera" / "pred N dňami" — pre widget Posledné PR. */
function agoLabel(iso: string, t: Awaited<ReturnType<typeof getTranslations<"analytics">>>): string {
  const days = Math.round((Date.now() - new Date(`${iso}T12:00:00Z`).getTime()) / 86_400_000);
  if (days <= 0) return t("today");
  if (days === 1) return t("yesterday");
  return t("daysAgo", { count: days });
}

// i18n-ignore-start — DEV náhľad (vymyslené dáta)
// DEV náhľad bez session (?preview=ok) — zoradenie od najviac rizikových klientov.
const PREVIEW_CLIENTS = [
  { id: "p1", full_name: "Ohrozený Oto", ended_at: null, deletion_requested_at: null },
  { id: "p2", full_name: "Priemerná Petra", ended_at: null, deletion_requested_at: null },
  { id: "p3", full_name: "Vzorový Viktor", ended_at: null, deletion_requested_at: null },
  { id: "p4", full_name: "Bez cieľa Braňo", ended_at: null, deletion_requested_at: null },
  { id: "p5", full_name: "Nováčik Nina", ended_at: null, deletion_requested_at: null },
];
const PREVIEW_OVERVIEW: Map<string, ClientAnalyticsRow> = new Map([
  ["p1", { nutritionPct30: 20, nutritionPct90: 35, trainingPct30: 13, trainingPct90: 22, planCompletionPct30: 41, lastTrainedOn: daysAgoIso(9), latestWeightKg: 91.2, weightDeltaKg: 1.4 }],
  ["p2", { nutritionPct30: 55, nutritionPct90: 60, trainingPct30: 50, trainingPct90: 58, planCompletionPct30: 64, lastTrainedOn: daysAgoIso(2), latestWeightKg: 78.4, weightDeltaKg: -0.6 }],
  ["p3", { nutritionPct30: 90, nutritionPct90: 87, trainingPct30: 93, trainingPct90: 88, planCompletionPct30: 88, lastTrainedOn: daysAgoIso(0), latestWeightKg: 82.1, weightDeltaKg: -2.3 }],
  ["p4", { nutritionPct30: null, nutritionPct90: null, trainingPct30: 70, trainingPct90: 65, planCompletionPct30: null, lastTrainedOn: daysAgoIso(3), latestWeightKg: null, weightDeltaKg: null }],
  ["p5", { nutritionPct30: null, nutritionPct90: null, trainingPct30: 0, trainingPct90: 0, planCompletionPct30: null, lastTrainedOn: null, latestWeightKg: null, weightDeltaKg: null }],
]);
const PREVIEW_PRS: Map<string, StrengthPR[]> = new Map([
  ["p3", [{ exercise: "Drep s veľkou činkou", bestWeightKg: 105, reps: 5, achievedOn: daysAgoIso(2) }]],
  ["p2", [{ exercise: "Mŕtvy ťah", bestWeightKg: 120, reps: 3, achievedOn: daysAgoIso(5) }]],
]);
const PREVIEW_AI_INSIGHTS: AiTopicInsight[] = [
  { topic: "koleno", label: "bolesť/nepohodlie v kolene", clientCount: 5 },
  { topic: "motivácia", label: "pokles motivácie", clientCount: 3 },
];

const PREVIEW_ROSTER_SUMMARY =
  "Portfólio je zmiešané — traja z piatich klientov držia tempo, dvaja potrebujú zásah. " +
  "Zameraj sa na Ota: tréning aj strava sú dlhodobo pod 25 % a váha za 90 dní stúpla o 1,4 kg — ozvi sa mu ešte tento týždeň. " +
  "Nina za mesiac neodcvičila ani jeden tréning, over či má aktívny plán. " +
  "Petra je hraničná (okolo 50 %), ale minulý týždeň si dala nové PR v mŕtvom ťahu (120 kg) — krátka pochvala ju udrží. " +
  "Viktor ide vzorovo: adherencia nad 90 %, váha −2,3 kg a nové PR v drepe (105 kg).";

function daysAgoIso(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

// i18n-ignore-end

export default async function AnalytikaPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const [ta, locale] = await Promise.all([getTranslations("analytics"), getLocale()]);
  const { preview } = await searchParams;
  const isPreview = preview === "ok" && process.env.NODE_ENV === "development";

  let activeClients: { id: string; full_name: string }[];
  let overview: Map<string, ClientAnalyticsRow> | null;
  // PR (celá história sily) a AI signály sú najpomalšie a ležia pod hlavnými číslami —
  // stránka na ne nečaká, panely sa dostreamujú cez <Suspense> nižšie.
  let recentPRs: Promise<Map<string, StrengthPR[]> | null>;
  let aiInsights: Promise<AiTopicInsight[] | null>;

  if (isPreview) {
    activeClients = PREVIEW_CLIENTS;
    overview = PREVIEW_OVERVIEW;
    recentPRs = Promise.resolve(PREVIEW_PRS);
    aiInsights = Promise.resolve(PREVIEW_AI_INSIGHTS);
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await getUser();
    if (!user) redirect("/prihlasenie");

    // AI signály nezávisia od zoznamu klientov — štartujú hneď (predtým až po ňom).
    aiInsights = getAiTopicInsights(supabase);
    aiInsights.catch(() => {});

    const { data: clients } = await supabase
      .from("clients")
      .select("id, full_name, ended_at, deletion_requested_at")
      .eq("trainer_id", user.id)
      .order("full_name");

    // Klient s ukončenou spoluprácou/na zmazanie nie je aktuálna starostlivosť —
    // rovnaké vylúčenie ako pri upozornení na meškanie na /dashboard.
    activeClients = (clients ?? []).filter((c) => !c.ended_at && !c.deletion_requested_at);
    const ids = activeClients.map((c) => c.id);
    recentPRs = getRecentPRs(ids, 14);
    recentPRs.catch(() => {});
    overview = await getClientAnalyticsOverview(ids);
  }

  if (!overview) {
    return (
      <>
        <div className={styles.pageHead}>
          <h1>{ta("title")}</h1>
          <p>{ta("subtitle")}</p>
        </div>
        <p className={styles.noWorkouts}>{ta("loadFailed")}</p>
      </>
    );
  }

  const rows = activeClients
    .map((c) => ({ client: c, data: overview.get(c.id) }))
    .filter((r): r is { client: (typeof activeClients)[number]; data: ClientAnalyticsRow } => r.data != null)
    .sort((a, b) => sortScore(a.data) - sortScore(b.data));

  const health = portfolioHealth(rows.map((r) => r.data));

  return (
    <>
      <div className={styles.pageHead}>
        <h1>
          {ta("title")} {rows.length > 0 && <InfoTip title={ta("howTitle")}>{ta("howText")}</InfoTip>}
        </h1>
        <p>
          {activeClients.length === 0 ? ta("noClients") : ta("sorted", { count: activeClients.length })}
        </p>
      </div>

      {rows.length > 0 && (
        <>
          <div className={styles.portfolioHealth}>
            <div className={`${styles.portfolioStat} ${styles.phOk}`}>
              <div className={styles.portfolioStatCount}>{health.ok}</div>
              <div className={styles.portfolioStatLabel}>{ta("ok")}</div>
            </div>
            <div className={`${styles.portfolioStat} ${styles.phWatch}`}>
              <div className={styles.portfolioStatCount}>{health.watch}</div>
              <div className={styles.portfolioStatLabel}>{ta("watch")}</div>
            </div>
            <div className={`${styles.portfolioStat} ${styles.phRisk}`}>
              <div className={styles.portfolioStatCount}>{health.risk}</div>
              <div className={styles.portfolioStatLabel}>{ta("risk")}</div>
            </div>
            {health.none > 0 && (
              <div className={`${styles.portfolioStat} ${styles.phNone}`}>
                <div className={styles.portfolioStatCount}>{health.none}</div>
                <div className={styles.portfolioStatLabel}>{ta("none")}</div>
              </div>
            )}
          </div>

          <Suspense fallback={null}>
            <RecentPRPanel clients={activeClients} data={recentPRs} />
          </Suspense>

          <Suspense fallback={null}>
            <AiInsightsPanel data={aiInsights} />
          </Suspense>

          <RosterSummaryCard previewSummary={isPreview ? PREVIEW_ROSTER_SUMMARY : null} />
        </>
      )}

      {rows.length > 0 ? (
        <div className={styles.roster}>
          {rows.map(({ client, data }) => (
            <Link key={client.id} href={`/dashboard/klienti/${client.id}`} className={styles.clientCard}>
              <div>
                <div className={styles.clientName}>{client.full_name}</div>
                <span className={styles.clientSince}>
                  {data.latestWeightKg != null ? `${data.latestWeightKg} kg` : ta("noWeight")}
                  {data.weightDeltaKg != null &&
                    ta("weightDelta", { delta: `${data.weightDeltaKg > 0 ? "+" : ""}${data.weightDeltaKg}` })}
                </span>
              </div>
              <span className={styles.clientMeta}>
                <span className={`${styles.statusChip} ${styles[pctTone(data.nutritionPct30)]}`}>
                  {data.nutritionPct30 != null ? ta("nutritionPct", { pct: data.nutritionPct30 }) : ta("nutritionNoGoal")}
                </span>
                <span className={`${styles.statusChip} ${styles[pctTone(data.trainingPct30)]}`}>
                  {ta("trainingPct", { pct: data.trainingPct30 })}
                </span>
                {data.planCompletionPct30 != null && (
                  <span className={`${styles.statusChip} ${styles[pctTone(data.planCompletionPct30)]}`}>
                    {ta("planPct", { pct: data.planCompletionPct30 })}
                  </span>
                )}
                <span className={styles.clientSince}>
                  {ta("lastTraining", { date: dateLabel(data.lastTrainedOn, ta("never"), locale) })}
                </span>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <h2>{ta("emptyTitle")}</h2>
          <p>{ta("emptyText")}</p>
        </div>
      )}
    </>
  );
}

async function RecentPRPanel({
  clients,
  data,
}: {
  clients: { id: string; full_name: string }[];
  data: Promise<Map<string, StrengthPR[]> | null>;
}) {
  const [recentPRs, t] = await Promise.all([data, getTranslations("analytics")]);
  const prList = clients
    .flatMap((c) => (recentPRs?.get(c.id) ?? []).map((pr) => ({ client: c, pr })))
    .sort((a, b) => b.pr.achievedOn.localeCompare(a.pr.achievedOn))
    .slice(0, 6);
  if (prList.length === 0) return null;
  return (
    <div className={styles.prPanel}>
      <p className={styles.prPanelTitle}>{t("prTitle")}</p>
      <ul className={styles.prPanelList}>
        {prList.map(({ client, pr }, i) => (
          <li key={`${client.id}-${pr.exercise}-${i}`}>
            <Link href={`/dashboard/klienti/${client.id}`}>
              {client.full_name} · {pr.exercise}
            </Link>
            <span>
              {pr.bestWeightKg} kg × {pr.reps} · {agoLabel(pr.achievedOn, t)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function AiInsightsPanel({ data }: { data: Promise<AiTopicInsight[] | null> }) {
  const [aiInsights, t] = await Promise.all([data, getTranslations("analytics")]);
  if (!aiInsights || aiInsights.length === 0) return null;
  return (
    <div className={styles.aiInsightsPanel}>
      <p className={styles.aiInsightsPanelTitle}>
        {t("aiTitle")} <InfoTip title={t("aiTipTitle")}>{t("aiTip")}</InfoTip>
      </p>
      <ul className={styles.aiInsightsList}>
        {aiInsights.map((i) => (
          <li key={i.topic}>
            <span>
              {t("aiAsked", { count: i.clientCount })}
            </span>
            <span>{i.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
