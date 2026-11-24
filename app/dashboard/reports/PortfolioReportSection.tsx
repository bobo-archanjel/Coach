import { getLocale, getTranslations } from "next-intl/server";
import { AppLink as Link } from "@/app/components/AppLink";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import { requireReports } from "@/lib/reports/guard";
import { buildPortfolioReport } from "@/lib/reports/loaders";
import { ActionDownloadIcon } from "@/app/components/ActionIcons";
import pa from "@/app/components/planActions.module.css";
import styles from "@/app/dashboard/dashboard.module.css";
import { ReportBarChart, type BarGroup } from "./ReportBarChart";
import { ReportsLocked } from "./ReportsLocked";
import rs from "./reports.module.css";

/**
 * Prehľad portfólia na /dashboard/analytika (Pokročilé reporty): počty, nové a ukončené spolupráce
 * po mesiacoch, aktivita po týždňoch a rebríčky najaktívnejších / ohrozených klientov. Server
 * komponent — tarifu overuje requireReports() (zamknutá karta sa vykreslí namiesto dát).
 */
export async function PortfolioReportSection() {
  const [auth, t, locale] = await Promise.all([requireReports(), getTranslations("reports"), getLocale() as Promise<Locale>]);
  if (!auth.ok) return auth.locked ? <ReportsLocked variant="portfolio" /> : null;

  const report = await buildPortfolioReport(auth.supabase, auth.userId);
  if (!report) {
    return (
      <div className={styles.card}>
        <h3>{t("portfolio.title")}</h3>
        <p className={styles.noWorkouts}>{t("errors.loadFailed")}</p>
      </div>
    );
  }

  const lc = intlLocale(locale);
  const monthShort = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString(lc, { month: "short", timeZone: "UTC" });
  const monthLong = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString(lc, { month: "long", year: "numeric", timeZone: "UTC" });
  const dayShort = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(lc, { day: "numeric", month: "numeric", timeZone: "UTC" });
  const dayLong = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(lc, { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" });

  if (report.activeClients === 0) {
    return (
      <div className={styles.card}>
        <h3>{t("portfolio.title")}</h3>
        <p className={styles.noWorkouts}>{t("portfolio.empty")}</p>
      </div>
    );
  }

  const monthGroups: BarGroup[] = report.months.map((m) => ({
    label: monthShort(m.month),
    title: monthLong(m.month),
    values: [m.started, m.ended],
    lines: [t("portfolio.startedLine", { count: m.started }), t("portfolio.endedLine", { count: m.ended })],
  }));
  const weekGroups: BarGroup[] = report.weeks.map((w) => ({
    label: dayShort(w.weekStart),
    title: t("adherence.weekOf", { date: dayLong(w.weekStart) }),
    values: [w.workouts],
    lines: [t("portfolio.weekLine", { workouts: w.workouts, clients: w.trainedClients })],
  }));

  const atRisk = report.clients
    .filter((c) => c.risk.atRisk)
    .sort((a, b) => (b.risk.daysInactive ?? 0) - (a.risk.daysInactive ?? 0) || a.score - b.score)
    .slice(0, 8);
  const mostActive = [...report.clients]
    .filter((c) => c.sessions14 > 0)
    .sort((a, b) => b.sessions14 - a.sessions14 || b.score - a.score)
    .slice(0, 5);
  const totalRisk = report.clients.filter((c) => c.risk.atRisk).length;

  return (
    <div className={styles.card} data-testid="portfolio-report">
      <h3>{t("portfolio.title")}</h3>

      <div className={rs.tiles}>
        <div className={rs.tile}>
          <div className={rs.tileLabel}>{t("portfolio.active")}</div>
          <div className={rs.tileValue}>{report.activeClients}</div>
          <div className={rs.tileSub}>{t("portfolio.endedTotal", { count: report.endedClients })}</div>
        </div>
        <div className={rs.tile}>
          <div className={rs.tileLabel}>{t("portfolio.newMonth")}</div>
          <div className={`${rs.tileValue} ${report.startedThisMonth > 0 ? rs.tone_ok : ""}`}>{report.startedThisMonth}</div>
          <div className={rs.tileSub}>{t("portfolio.thisMonth")}</div>
        </div>
        <div className={rs.tile}>
          <div className={rs.tileLabel}>{t("portfolio.endedMonth")}</div>
          <div className={rs.tileValue}>{report.endedThisMonth}</div>
          <div className={rs.tileSub}>{t("portfolio.thisMonth")}</div>
        </div>
        <div className={rs.tile}>
          <div className={rs.tileLabel}>{t("portfolio.atRisk")}</div>
          <div className={`${rs.tileValue} ${totalRisk > 0 ? rs.tone_risk : rs.tone_ok}`}>{totalRisk}</div>
          <div className={rs.tileSub}>{t("portfolio.atRiskSub")}</div>
        </div>
      </div>

      <h4 className={styles.cardSubhead}>{t("portfolio.cooperations")}</h4>
      <ReportBarChart
        groups={monthGroups}
        series={[
          { label: t("portfolio.started"), color: "var(--moss)" },
          { label: t("portfolio.ended"), color: "var(--accent)" },
        ]}
        ariaLabel={t("portfolio.cooperationsAria")}
        showValues={false}
      />
      <p className={rs.hint}>{t("portfolio.cooperationsHint")}</p>

      <h4 className={styles.cardSubhead}>{t("portfolio.activity")}</h4>
      <ReportBarChart groups={weekGroups} series={[{ label: t("portfolio.workouts"), color: "var(--accent)" }]} ariaLabel={t("portfolio.activityAria")} />

      <div className={`${rs.rankGrid} ${rs.sectionGap}`}>
        <div>
          <h4 className={styles.cardSubhead}>{t("portfolio.mostActive")}</h4>
          {mostActive.length === 0 ? (
            <p className={styles.noWorkouts}>{t("portfolio.noActive")}</p>
          ) : (
            <ol className={rs.rankList}>
              {mostActive.map((c) => (
                <li key={c.id}>
                  <Link href={`/dashboard/klienti/${c.id}?sekcia=reporty`}>{c.name}</Link>
                  <span className={rs.rankMeta}>{t("portfolio.sessions14", { count: c.sessions14 })}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div>
          <h4 className={styles.cardSubhead}>{t("portfolio.atRiskList")}</h4>
          {atRisk.length === 0 ? (
            <p className={rs.okNote}>{t("portfolio.noRisk")}</p>
          ) : (
            <ul className={rs.rankList}>
              {atRisk.map((c) => (
                <li key={c.id}>
                  <Link href={`/dashboard/klienti/${c.id}?sekcia=reporty`}>{c.name}</Link>
                  <span className={rs.rankMeta}>
                    {c.risk.reasons.map((r) => t(`risk.short.${r}`, { days: c.risk.daysInactive ?? 0 })).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className={`${pa.grid} ${pa.narrow} ${rs.sectionGap}`}>
        <a href="/api/export/report/portfolio/csv" className={`${pa.action} ${pa.small}`} data-testid="portfolio-csv">
          <ActionDownloadIcon />
          {t("portfolio.csv")}
        </a>
      </div>
    </div>
  );
}
