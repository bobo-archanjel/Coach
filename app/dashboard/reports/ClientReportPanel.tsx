"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { intlLocale } from "@/lib/i18n/locales";
import { lastMonths, PERIOD_KEYS, DEFAULT_PERIOD, type PeriodKey } from "@/lib/reports/period";
import { MEASURE_KEYS, type ClientReport, type MeasureKey } from "@/lib/reports/types";
import type { Comparison } from "@/lib/reports/aggregate";
import { LineChart } from "../LineChart";
import { ReportBarChart, type BarGroup } from "./ReportBarChart";
import { loadClientReportAction } from "./actions";
import { ActionDownloadIcon } from "@/app/components/ActionIcons";
import pa from "@/app/components/planActions.module.css";
import styles from "@/app/dashboard/dashboard.module.css";
import rs from "./reports.module.css";

const MEASURE_UNIT: Record<MeasureKey, string> = { weight: "kg", waist: "cm", chest: "cm", hips: "cm", arm: "cm", thigh: "cm" };

/**
 * Záložka Reporty na detaile klienta: progres v čase (telo, sila), adherencia (tréning, strava),
 * riziko a export. Dáta sa načítajú až po otvorení záložky (server action — tarifu overuje server)
 * a znova pri zmene obdobia.
 */
export function ClientReportPanel({ clientId }: { clientId: string }) {
  const t = useTranslations("reports");
  const locale = intlLocale(useLocale() as Parameters<typeof intlLocale>[0]);
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD);
  const [report, setReport] = useState<ClientReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reqId = useRef(0);

  const load = useCallback(
    async (p: PeriodKey) => {
      const id = ++reqId.current;
      setLoading(true);
      setError(null);
      try {
        const res = await loadClientReportAction(clientId, p);
        if (id !== reqId.current) return; // medzitým sa zvolilo iné obdobie
        if (res.report) setReport(res.report);
        else setError(res.error);
      } catch {
        if (id === reqId.current) setError(t("errors.loadFailed"));
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [clientId, t],
  );

  useEffect(() => {
    void load(period);
  }, [load, period]);

  const fmtDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "numeric", timeZone: "UTC" });
  const fmtDateY = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" });

  return (
    <div className={rs.stack} aria-busy={loading}>
      <div className={rs.head}>
        <div className={rs.periodBar} role="group" aria-label={t("periods.label")}>
          {PERIOD_KEYS.map((k) => (
            <button key={k} type="button" aria-pressed={period === k} className={`${rs.periodBtn} ${period === k ? rs.periodBtnActive : ""}`} onClick={() => setPeriod(k)}>
              {t(`periods.${k}`)}
            </button>
          ))}
        </div>
        {report && !loading && (
          <span className={rs.rangeNote}>{t("client.range", { from: fmtDateY(report.from), to: fmtDateY(report.to) })}</span>
        )}
      </div>

      {error && (
        <div className={styles.card} role="alert">
          <p className={styles.noWorkouts}>{error}</p>
          <button type="button" className={styles.backLink} onClick={() => void load(period)} style={{ marginTop: 8 }}>
            {t("retry")}
          </button>
        </div>
      )}

      {!report && loading && !error && <ReportSkeleton />}

      {report && (
        <div className={rs.stack} style={{ opacity: loading ? 0.6 : 1, transition: "opacity 0.15s" }}>
          <RiskBlock report={report} />
          <ProgressCard report={report} fmtDate={fmtDate} fmtDateY={fmtDateY} locale={locale} />
          <AdherenceCard report={report} fmtDate={fmtDate} fmtDateY={fmtDateY} locale={locale} />
          <ExportCard report={report} period={period} locale={locale} clientId={clientId} />
        </div>
      )}
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className={styles.skeletonWrap} aria-hidden="true">
      <div className={`${styles.skeletonBlock} ${styles.skeletonCard}`} />
      <div className={`${styles.skeletonBlock} ${styles.skeletonCard}`} />
      <div className={`${styles.skeletonBlock} ${styles.skeletonCard}`} />
    </div>
  );
}

function RiskBlock({ report }: { report: ClientReport }) {
  const t = useTranslations("reports.risk");
  const { risk } = report;
  if (!risk.atRisk) {
    return (
      <p className={rs.okNote}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        {t("ok")}
      </p>
    );
  }
  return (
    <div className={rs.risk} role="note" data-testid="report-risk">
      <span className={rs.riskIcon} aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 9v4M12 17h.01" />
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        </svg>
      </span>
      <div className={rs.riskBody}>
        <strong>{t("title")}</strong>
        <ul>
          {risk.reasons.map((r) => (
            <li key={r}>{t(`reasons.${r}`, { days: risk.daysInactive ?? 0 })}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

interface FmtProps {
  report: ClientReport;
  fmtDate: (iso: string) => string;
  fmtDateY: (iso: string) => string;
  locale: string;
}

const numFmt = (locale: string, v: number, digits = 1) => v.toLocaleString(locale, { maximumFractionDigits: digits });

function CompareLine({ cmp, unit, locale, fmtDateY, lowerIsBetter }: { cmp: Comparison | null; unit: string; locale: string; fmtDateY: (i: string) => string; lowerIsBetter?: boolean }) {
  const t = useTranslations("reports.compare");
  if (!cmp) return <p className={rs.hint}>{t("notEnough")}</p>;
  const good = lowerIsBetter ? cmp.delta < 0 : cmp.delta > 0;
  const tone = cmp.delta === 0 ? rs.deltaFlat : good ? rs.deltaUp : rs.deltaDown;
  const sign = cmp.delta > 0 ? "+" : cmp.delta < 0 ? "−" : "";
  return (
    <div className={rs.compare}>
      <span>
        {t("start")} <strong>{numFmt(locale, cmp.start)} {unit}</strong> ({fmtDateY(cmp.startDate)})
      </span>
      <span>
        {t("end")} <strong>{numFmt(locale, cmp.end)} {unit}</strong> ({fmtDateY(cmp.endDate)})
      </span>
      <span className={tone}>
        {sign}
        {numFmt(locale, Math.abs(cmp.delta))} {unit}
        {cmp.pct != null && ` (${sign}${numFmt(locale, Math.abs(cmp.pct))} %)`}
      </span>
    </div>
  );
}

function ProgressCard({ report, fmtDateY, locale }: FmtProps) {
  const t = useTranslations("reports");
  const available = MEASURE_KEYS.filter((k) => report.measures[k].length > 0);
  const [measure, setMeasure] = useState<MeasureKey>(available[0] ?? "weight");
  const activeMeasure = available.includes(measure) ? measure : (available[0] ?? "weight");
  const [exercise, setExercise] = useState(report.strength[0]?.name ?? "");
  const ex = report.strength.find((s) => s.name === exercise) ?? report.strength[0];

  return (
    <div className={styles.card}>
      <h3>{t("progress.title")}</h3>

      <h4 className={styles.cardSubhead}>{t("progress.body")}</h4>
      {available.length === 0 ? (
        <p className={styles.noWorkouts}>{t("progress.noBody")}</p>
      ) : (
        <>
          <div className={rs.chips} role="group" aria-label={t("progress.body")}>
            {available.map((k) => (
              <button key={k} type="button" aria-pressed={activeMeasure === k} className={`${rs.chip} ${activeMeasure === k ? rs.chipActive : ""}`} onClick={() => setMeasure(k)}>
                {t(`measures.${k}`)}
              </button>
            ))}
          </div>
          <LineChart points={report.measures[activeMeasure]} unit={MEASURE_UNIT[activeMeasure]} color="var(--accent)" />
          <CompareLine cmp={report.comparisons[activeMeasure]} unit={MEASURE_UNIT[activeMeasure]} locale={locale} fmtDateY={fmtDateY} lowerIsBetter />
        </>
      )}

      <h4 className={styles.cardSubhead}>{t("progress.strength")}</h4>
      {!ex ? (
        <p className={styles.noWorkouts}>{t("progress.noStrength")}</p>
      ) : (
        <>
          <select value={ex.name} onChange={(e) => setExercise(e.target.value)} className={styles.addClientInputSm} style={{ marginBottom: 12, width: "100%" }} aria-label={t("progress.chooseExercise")}>
            {report.strength.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          <LineChart points={ex.points.map((p) => ({ date: p.date, value: p.value }))} unit="kg" color="var(--accent)" />
          <CompareLine cmp={ex.comparison} unit="kg" locale={locale} fmtDateY={fmtDateY} />
          <p className={rs.hint}>{t("progress.e1rmHint", { best: numFmt(locale, ex.bestWeightKg) })}</p>
        </>
      )}
    </div>
  );
}

function AdherenceCard({ report, fmtDate, fmtDateY, locale }: FmtProps) {
  const t = useTranslations("reports");
  const { training, nutrition } = report;
  const s = training.summary;

  const groups: BarGroup[] = training.weeks.map((w) => ({
    label: fmtDate(w.weekStart),
    title: t("adherence.weekOf", { date: fmtDateY(w.weekStart) }),
    values: [w.pct],
    lines: [t("adherence.weekLine", { done: w.sessions, target: w.target, pct: w.pct }) + (w.current ? ` · ${t("adherence.ongoing")}` : "")],
  }));

  const kcalGroups: BarGroup[] = nutrition.weekly.map((w) => ({
    label: fmtDate(w.weekStart),
    title: t("adherence.weekOf", { date: fmtDateY(w.weekStart) }),
    values: [w.avgKcal],
    lines: [w.avgKcal != null ? t("nutrition.weekLine", { kcal: numFmt(locale, w.avgKcal, 0), days: w.daysLogged }) : t("nutrition.weekNone")],
  }));

  const tone = (pct: number | null) => (pct == null ? "" : pct >= 70 ? rs.tone_ok : pct < 40 ? rs.tone_risk : rs.tone_watch);

  return (
    <div className={styles.card}>
      <h3>{t("adherence.title")}</h3>

      <h4 className={styles.cardSubhead}>{t("adherence.training")}</h4>
      <div className={rs.tiles}>
        <div className={rs.tile}>
          <div className={rs.tileLabel}>{t("adherence.planned")}</div>
          <div className={`${rs.tileValue} ${tone(s.pct)}`}>{s.pct != null ? `${s.pct} %` : "—"}</div>
          <div className={rs.tileSub}>{t("adherence.weeksMet", { met: s.weeksMet, counted: s.weeksCounted })}</div>
        </div>
        <div className={rs.tile}>
          <div className={rs.tileLabel}>{t("adherence.sessions")}</div>
          <div className={rs.tileValue}>{s.sessions}</div>
          <div className={rs.tileSub}>{t("adherence.target", { target: training.weeklyTarget })}</div>
        </div>
        <div className={rs.tile}>
          <div className={rs.tileLabel}>{t("adherence.streak")}</div>
          <div className={rs.tileValue}>{t("adherence.streakValue", { count: training.streakWeeks })}</div>
          <div className={rs.tileSub}>{training.lastWorkoutOn ? t("adherence.last", { date: fmtDateY(training.lastWorkoutOn) }) : t("adherence.never")}</div>
        </div>
      </div>
      {groups.length > 0 && s.sessions + s.weeksCounted > 0 ? (
        <ReportBarChart groups={groups} series={[{ label: t("adherence.planned"), color: "var(--accent)" }]} max={100} refLine={{ value: 100, label: t("adherence.goalLine") }} ariaLabel={t("adherence.chartAria")} formatValue={(v) => `${v}`} />
      ) : (
        <p className={styles.noWorkouts}>{t("adherence.empty")}</p>
      )}
      {!training.hasPlan && <p className={rs.hint}>{t("adherence.noPlan", { target: training.weeklyTarget })}</p>}

      <h4 className={styles.cardSubhead}>{t("nutrition.title")}</h4>
      {nutrition.daysLogged === 0 ? (
        <p className={styles.noWorkouts}>{t("nutrition.empty")}</p>
      ) : (
        <>
          <div className={rs.tiles}>
            <div className={rs.tile}>
              <div className={rs.tileLabel}>{t("nutrition.logged")}</div>
              <div className={rs.tileValue}>
                {nutrition.daysLogged} / {nutrition.daysTotal}
              </div>
              <div className={rs.tileSub}>{t("nutrition.loggedSub", { pct: nutrition.loggedPct ?? 0 })}</div>
            </div>
            <div className={rs.tile}>
              <div className={rs.tileLabel}>{t("nutrition.avgKcal")}</div>
              <div className={rs.tileValue}>{nutrition.avgKcal != null ? `${numFmt(locale, nutrition.avgKcal, 0)} kcal` : "—"}</div>
              <div className={rs.tileSub}>{nutrition.kcalTarget ? t("nutrition.vsTarget", { pct: nutrition.avgKcalPct ?? 0, target: numFmt(locale, nutrition.kcalTarget, 0) }) : t("nutrition.noGoal")}</div>
            </div>
            <div className={rs.tile}>
              <div className={rs.tileLabel}>{t("nutrition.within")}</div>
              <div className={`${rs.tileValue} ${tone(nutrition.withinPct)}`}>{nutrition.withinPct != null ? `${nutrition.withinPct} %` : "—"}</div>
              <div className={rs.tileSub}>{nutrition.hasGoal ? t("nutrition.withinSub", { days: nutrition.daysWithin, logged: nutrition.daysLogged }) : t("nutrition.noGoal")}</div>
            </div>
            <div className={rs.tile}>
              <div className={rs.tileLabel}>{t("nutrition.protein")}</div>
              <div className={rs.tileValue}>{nutrition.avgProtein != null ? `${nutrition.avgProtein} g` : "—"}</div>
              <div className={rs.tileSub}>{nutrition.proteinTarget ? t("nutrition.vsTarget", { pct: nutrition.avgProteinPct ?? 0, target: `${numFmt(locale, nutrition.proteinTarget, 0)} g` }) : t("nutrition.noGoal")}</div>
            </div>
          </div>
          <ReportBarChart
            groups={kcalGroups}
            series={[{ label: t("nutrition.avgKcal"), color: "var(--plate-yellow)" }]}
            refLine={nutrition.kcalTarget ? { value: nutrition.kcalTarget, label: t("nutrition.targetLine", { kcal: numFmt(locale, nutrition.kcalTarget, 0) }) } : undefined}
            ariaLabel={t("nutrition.chartAria")}
            showValues={false}
          />
          <p className={rs.hint}>{t("nutrition.hint")}</p>
        </>
      )}
    </div>
  );
}

function ExportCard({ report, period, locale, clientId }: { report: ClientReport; period: PeriodKey; locale: string; clientId: string }) {
  const t = useTranslations("reports.export");
  const months = lastMonths(report.today, 6).reverse();
  const [month, setMonth] = useState(months[1] ?? months[0]);
  const monthLabel = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className={styles.card}>
      <h3>{t("title")}</h3>
      <div className={rs.exportBar}>
        <label className={rs.exportLabel} htmlFor={`rep-month-${clientId}`}>
          {t("month")}
        </label>
        <select id={`rep-month-${clientId}`} value={month} onChange={(e) => setMonth(e.target.value)} className={styles.addClientInputSm}>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
        <div className={`${pa.grid} ${pa.narrow}`} style={{ margin: 0 }}>
          <a href={`/api/export/report/${clientId}/pdf?month=${month}`} className={`${pa.action} ${pa.small}`} data-testid="report-pdf">
            <ActionDownloadIcon />
            {t("pdf")}
          </a>
          <a href={`/api/export/report/${clientId}/csv?period=${period}`} className={`${pa.action} ${pa.small}`} data-testid="report-csv">
            <ActionDownloadIcon />
            {t("csv")}
          </a>
        </div>
      </div>
      <p className={rs.hint}>{t("hint")}</p>
    </div>
  );
}
