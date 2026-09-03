import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { getClientAnalyticsOverview, type ClientAnalyticsRow } from "@/lib/dashboard/analytics";
import styles from "../dashboard.module.css";

/** Prehľad naprieč klientmi — Progres a analýza (feature/progress-analyst), zatiaľ len tréner. */

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

function dateLabel(iso: string | null): string {
  if (!iso) return "nikdy";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("sk-SK", { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" });
}

// DEV náhľad bez session (?preview=ok) — zoradenie od najviac rizikových klientov.
const PREVIEW_CLIENTS = [
  { id: "p1", full_name: "Ohrozený Oto", ended_at: null, deletion_requested_at: null },
  { id: "p2", full_name: "Priemerná Petra", ended_at: null, deletion_requested_at: null },
  { id: "p3", full_name: "Vzorový Viktor", ended_at: null, deletion_requested_at: null },
  { id: "p4", full_name: "Bez cieľa Braňo", ended_at: null, deletion_requested_at: null },
];
const PREVIEW_OVERVIEW = new Map([
  ["p1", { nutritionPct30: 20, nutritionPct90: 35, trainingPct30: 13, trainingPct90: 22, lastTrainedOn: daysAgoIso(9), latestWeightKg: 91.2, weightDeltaKg: 1.4 }],
  ["p2", { nutritionPct30: 55, nutritionPct90: 60, trainingPct30: 50, trainingPct90: 58, lastTrainedOn: daysAgoIso(2), latestWeightKg: 78.4, weightDeltaKg: -0.6 }],
  ["p3", { nutritionPct30: 90, nutritionPct90: 87, trainingPct30: 93, trainingPct90: 88, lastTrainedOn: daysAgoIso(0), latestWeightKg: 82.1, weightDeltaKg: -2.3 }],
  ["p4", { nutritionPct30: null, nutritionPct90: null, trainingPct30: 70, trainingPct90: 65, lastTrainedOn: daysAgoIso(3), latestWeightKg: null, weightDeltaKg: null }],
]);
function daysAgoIso(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

export default async function AnalytikaPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;

  let activeClients: { id: string; full_name: string }[];
  let overview: Map<string, ClientAnalyticsRow> | null;

  if (preview === "ok" && process.env.NODE_ENV !== "production") {
    activeClients = PREVIEW_CLIENTS;
    overview = PREVIEW_OVERVIEW;
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
    overview = await getClientAnalyticsOverview(activeClients.map((c) => c.id));
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
                  {data.nutritionPct30 != null ? `Strava ${data.nutritionPct30} %` : "Strava — bez cieľa"}
                </span>
                <span className={`${styles.statusChip} ${styles[pctTone(data.trainingPct30)]}`}>
                  Tréning {data.trainingPct30}&nbsp;%
                </span>
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
        aspoň jeden deň). Klient bez makro cieľa nemá stravu s čím porovnať.
      </p>
    </>
  );
}
