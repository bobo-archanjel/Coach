import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { getClientAnalyticsOverview, type ClientAnalyticsRow } from "@/lib/dashboard/analytics";
import { getRecentPRs, type StrengthPR } from "@/lib/dashboard/bodyMetrics";
import { getAiTopicInsights, type AiTopicInsight } from "@/lib/dashboard/aiInsights";
import { RosterSummaryCard } from "./RosterSummaryCard";
import styles from "../dashboard.module.css";

/** Prehľad naprieč klientmi — Progres a analýza (feature/progress-analyst), rozšírené feature/analytika-v2. */

function pctTone(pct: number | null): "active" | "late" | "ended" {
  if (pct == null) return "ended";
  if (pct >= 70) return "active";
  if (pct < 40) return "late";
  return "ended";
}

/** Zoraďovacie skóre — čo najnižšie prvé (najviac potrebuje pozornosť). Priemer z dostupných %. */
function sortScore(row: ClientAnalyticsRow): number {
  const values = [row.nutritionPct30, row.trainingPct30].filter((v): v is number => v != null);
  if (values.length === 0) return 100;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Klient bez akéhokoľvek signálu za 30 dní — nepatrí do žiadneho zdravotného koša, ukáže sa zvlášť. */
function hasNoSignal(row: ClientAnalyticsRow): boolean {
  return row.nutritionPct30 == null && row.trainingPct30 === 0 && row.lastTrainedOn == null;
}

/**
 * Zdravie celého portfólia — počty klientov podľa rovnakých prahov ako `pctTone`
 * (≥70 % v poriadku, <40 % riziko, medzi tým sleduj), aby tréner videl stav na
 * prvý pohľad, nie len zoradený zoznam. "Bez dát" = klient, ktorý za 30 dní nič
 * neodcvičil ani nemá makro cieľ (inak by umelo napĺňal "Riziko").
 */
function portfolioHealth(rows: ClientAnalyticsRow[]): { ok: number; watch: number; risk: number; none: number } {
  const health = { ok: 0, watch: 0, risk: 0, none: 0 };
  for (const row of rows) {
    if (hasNoSignal(row)) {
      health.none++;
      continue;
    }
    const score = sortScore(row);
    if (score >= 70) health.ok++;
    else if (score < 40) health.risk++;
    else health.watch++;
  }
  return health;
}

function dateLabel(iso: string | null): string {
  if (!iso) return "nikdy";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("sk-SK", { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "dnes" / "včera" / "pred N dňami" — pre widget Posledné PR. */
function agoLabel(iso: string): string {
  const days = Math.round((Date.now() - new Date(`${iso}T12:00:00Z`).getTime()) / 86_400_000);
  if (days <= 0) return "dnes";
  if (days === 1) return "včera";
  return `pred ${days} dňami`;
}

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

export default async function AnalytikaPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;
  const isPreview = preview === "ok" && process.env.NODE_ENV !== "production";

  let activeClients: { id: string; full_name: string }[];
  let overview: Map<string, ClientAnalyticsRow> | null;
  let recentPRs: Map<string, StrengthPR[]> | null;
  let aiInsights: AiTopicInsight[] | null;

  if (isPreview) {
    activeClients = PREVIEW_CLIENTS;
    overview = PREVIEW_OVERVIEW;
    recentPRs = PREVIEW_PRS;
    aiInsights = PREVIEW_AI_INSIGHTS;
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await getUser();
    if (!user) redirect("/prihlasenie");

    const { data: clients } = await supabase
      .from("clients")
      .select("id, full_name, ended_at, deletion_requested_at")
      .eq("trainer_id", user.id)
      .order("full_name");

    // Klient s ukončenou spoluprácou/na zmazanie nie je aktuálna starostlivosť —
    // rovnaké vylúčenie ako pri upozornení na meškanie na /dashboard.
    activeClients = (clients ?? []).filter((c) => !c.ended_at && !c.deletion_requested_at);
    const ids = activeClients.map((c) => c.id);
    [overview, recentPRs, aiInsights] = await Promise.all([
      getClientAnalyticsOverview(ids),
      getRecentPRs(ids, 14),
      getAiTopicInsights(supabase),
    ]);
  }

  if (!overview) {
    return (
      <>
        <div className={styles.pageHead}>
          <h1>Analytika</h1>
          <p>Prehľad adherencie a progresu naprieč klientmi.</p>
        </div>
        <p className={styles.noWorkouts}>Prehľad sa nepodarilo načítať — skús obnoviť stránku.</p>
      </>
    );
  }

  const rows = activeClients
    .map((c) => ({ client: c, data: overview.get(c.id) }))
    .filter((r): r is { client: (typeof activeClients)[number]; data: ClientAnalyticsRow } => r.data != null)
    .sort((a, b) => sortScore(a.data) - sortScore(b.data));

  const health = portfolioHealth(rows.map((r) => r.data));

  const prList = activeClients
    .flatMap((c) => (recentPRs?.get(c.id) ?? []).map((pr) => ({ client: c, pr })))
    .sort((a, b) => b.pr.achievedOn.localeCompare(a.pr.achievedOn))
    .slice(0, 6);

  return (
    <>
      <div className={styles.pageHead}>
        <h1>Analytika</h1>
        <p>
          {activeClients.length === 0
            ? "Zatiaľ nemáš klientov na analýzu."
            : `${activeClients.length} klientov · zoradené od tých, ktorí najviac potrebujú pozornosť.`}
        </p>
      </div>

      {rows.length > 0 && (
        <>
          <div className={styles.portfolioHealth}>
            <div className={`${styles.portfolioStat} ${styles.phOk}`}>
              <div className={styles.portfolioStatCount}>{health.ok}</div>
              <div className={styles.portfolioStatLabel}>V poriadku</div>
            </div>
            <div className={`${styles.portfolioStat} ${styles.phWatch}`}>
              <div className={styles.portfolioStatCount}>{health.watch}</div>
              <div className={styles.portfolioStatLabel}>Sleduj</div>
            </div>
            <div className={`${styles.portfolioStat} ${styles.phRisk}`}>
              <div className={styles.portfolioStatCount}>{health.risk}</div>
              <div className={styles.portfolioStatLabel}>Riziko</div>
            </div>
            {health.none > 0 && (
              <div className={`${styles.portfolioStat} ${styles.phNone}`}>
                <div className={styles.portfolioStatCount}>{health.none}</div>
                <div className={styles.portfolioStatLabel}>Bez dát</div>
              </div>
            )}
          </div>

          {prList.length > 0 && (
            <div className={styles.prPanel}>
              <p className={styles.prPanelTitle}>Posledné osobné maximá · 14 dní</p>
              <ul className={styles.prPanelList}>
                {prList.map(({ client, pr }, i) => (
                  <li key={`${client.id}-${pr.exercise}-${i}`}>
                    <Link href={`/dashboard/klienti/${client.id}`}>
                      {client.full_name} · {pr.exercise}
                    </Link>
                    <span>
                      {pr.bestWeightKg} kg × {pr.reps} · {agoLabel(pr.achievedOn)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {aiInsights != null && aiInsights.length > 0 && (
            <div className={styles.aiInsightsPanel}>
              <p className={styles.aiInsightsPanelTitle}>AI Kouč · skoré signály · {"posledných 7 dní"}</p>
              <ul className={styles.aiInsightsList}>
                {aiInsights.map((i) => (
                  <li key={i.topic}>
                    <span>
                      {i.clientCount} {i.clientCount === 1 ? "klient sa" : i.clientCount < 5 ? "klienti sa" : "klientov sa"} pýtalo
                      AI Kouča na
                    </span>
                    <span>{i.label}</span>
                  </li>
                ))}
              </ul>
              <p className={styles.aiInsightsHint}>
                Agregované naprieč aspoň 3 klientmi, bez prístupu appky k obsahu konverzácie — AI Kouč zostáva súkromný chat.
              </p>
            </div>
          )}

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
                  {data.latestWeightKg != null ? `${data.latestWeightKg} kg` : "váha nezaznamenaná"}
                  {data.weightDeltaKg != null && (
                    <> · {data.weightDeltaKg > 0 ? "+" : ""}{data.weightDeltaKg} kg (90 dní)</>
                  )}
                </span>
              </div>
              <span className={styles.clientMeta}>
                <span className={`${styles.statusChip} ${styles[pctTone(data.nutritionPct30)]}`}>
                  {data.nutritionPct30 != null ? `Strava ${data.nutritionPct30} %` : "Strava — bez cieľa"}
                </span>
                <span className={`${styles.statusChip} ${styles[pctTone(data.trainingPct30)]}`}>
                  Tréning {data.trainingPct30}&nbsp;%
                </span>
                {data.planCompletionPct30 != null && (
                  <span className={`${styles.statusChip} ${styles[pctTone(data.planCompletionPct30)]}`}>
                    Plán {data.planCompletionPct30}&nbsp;%
                  </span>
                )}
                <span className={styles.clientSince}>posledný tréning: {dateLabel(data.lastTrainedOn)}</span>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <h2>Zatiaľ nič na zobrazenie</h2>
          <p>Pridaj klientov a nechaj ich zbierať dáta (tréningy, strava, merania).</p>
        </div>
      )}

      <p className={styles.chartHint} style={{ marginTop: 20 }}>
        % = podiel dní za posledných 30 dní, kedy bol klient „v poriadku“ (strava 85–115&nbsp;% cieľa, tréning = odcvičil
        aspoň jeden deň). „Plán“ = nakoľko sa odcvičené série/opakovania/váha zhodujú s predpisom z tréningového plánu.
        Klient bez makro cieľa nemá stravu s čím porovnať.
      </p>
    </>
  );
}
