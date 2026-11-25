// FitPilot — mesačný report klienta do PDF (Pokročilé reporty). Rovnaká infraštruktúra ako
// progresový export (lib/pdf/document.ts), navyše vektorové grafy (reportCharts.ts): váha,
// adherencia tréningu po týždňoch, denná strava oproti cieľu, sila a telesné miery začiatok vs. koniec.

import { createTranslator } from "next-intl";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import skReports from "@/messages/sk/reports.json";
import csReports from "@/messages/cs/reports.json";
import type { Comparison } from "@/lib/reports/aggregate";
import { MEASURE_KEYS, type ClientReport, type MeasureKey } from "@/lib/reports/types";
import { COLORS, createPdfContext, PdfWriter, skDate, type TableColumn, type Tile } from "./document";
import { drawBarChart, drawLineChart } from "./reportCharts";

const REPORT_MESSAGES: Record<Locale, typeof skReports> = { sk: skReports, cs: csReports };
const UNIT: Record<MeasureKey, string> = { weight: "kg", waist: "cm", chest: "cm", hips: "cm", arm: "cm", thigh: "cm" };

export interface ClientReportPdfInput {
  report: ClientReport;
  /** YYYY-MM */
  month: string;
}

export async function generateClientReportPdf(input: ClientReportPdfInput, locale: Locale = "sk"): Promise<Uint8Array> {
  const { report } = input;
  const tr = createTranslator({ locale, messages: { reports: REPORT_MESSAGES[locale] }, namespace: "reports" });
  const t = (key: string, values?: Record<string, string | number>) => (tr as unknown as (k: string, v?: Record<string, string | number>) => string)(key, values);
  const lc = intlLocale(locale);
  const num = (v: number, digits = 1) => v.toLocaleString(lc, { maximumFractionDigits: digits });
  const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${num(Math.abs(v))}`;
  const monthName = new Date(`${input.month}-15T12:00:00Z`).toLocaleDateString(lc, { month: "long", year: "numeric", timeZone: "UTC" });
  const shortDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(lc, { day: "numeric", month: "numeric", timeZone: "UTC" });

  const ctx = await createPdfContext(locale);
  const fonts = { regular: ctx.regular, semibold: ctx.semibold };
  const w = new PdfWriter(ctx, t("pdf.kind"));
  w.title({
    title: report.clientName,
    meta: [t("pdf.subtitle", { month: monthName }), t("pdf.range", { from: skDate(report.from), to: skDate(report.to) })],
  });

  // ---------- súhrnné dlaždice ----------
  const { training, nutrition } = report;
  const weightCmp = report.comparisons.weight;
  const tiles: Tile[] = [
    { label: t("pdf.tiles.sessions"), value: String(training.summary.sessions), sub: t("adherence.target", { target: training.weeklyTarget }) },
    {
      label: t("pdf.tiles.plan"),
      value: training.summary.pct != null ? `${training.summary.pct} %` : "—",
      sub: t("pdf.tiles.planSub", { met: training.summary.weeksMet, counted: training.summary.weeksCounted }),
    },
    {
      label: t("pdf.tiles.nutrition"),
      value: nutrition.withinPct != null ? `${nutrition.withinPct} %` : "—",
      sub: nutrition.hasGoal ? t("nutrition.withinSub", { days: nutrition.daysWithin, logged: nutrition.daysLogged }) : t("nutrition.noGoal"),
    },
    {
      label: t("pdf.tiles.weight"),
      value: weightCmp ? `${signed(weightCmp.delta)} kg` : "—",
      sub: weightCmp ? `${num(weightCmp.start)} → ${num(weightCmp.end)} kg` : t("pdf.noMeasurements"),
    },
  ];
  w.tiles(tiles);

  // ---------- pozornosť ----------
  if (report.risk.atRisk) {
    const cols: TableColumn[] = [{ text: t("pdf.attention"), width: 1, strong: false }];
    w.tableCard({
      title: t("risk.title"),
      columns: cols,
      rows: report.risk.reasons.map((r) => ({ cells: [t(`risk.reasons.${r}`, { days: report.risk.daysInactive ?? 0 })] })),
    });
  }

  // ---------- váha ----------
  const weight = report.measures.weight;
  w.chartCard({
    title: t("pdf.weightTitle"),
    aside: weightCmp ? `${signed(weightCmp.delta)} kg` : undefined,
    height: weight.length > 0 ? 130 : 26,
    draw: (page, box) => {
      if (weight.length === 0) {
        page.drawText(t("pdf.noMeasurements"), { x: box.x, y: box.yTop - 16, size: 10, font: ctx.regular, color: COLORS.faint });
        return;
      }
      drawLineChart(page, box, weight, { ...fonts, fmtValue: (v) => `${num(v)} kg`, fmtDate: (d) => skDate(d) });
    },
  });

  // ---------- adherencia po týždňoch ----------
  w.chartCard({
    title: t("pdf.weeklyTitle"),
    aside: training.summary.pct != null ? `${training.summary.pct} %` : undefined,
    subtitle: t("pdf.weeklyNote", { target: training.weeklyTarget }),
    height: 120,
    draw: (page, box) =>
      drawBarChart(
        page,
        box,
        training.weeks.map((wk) => ({ label: shortDay(wk.weekStart), value: wk.pct })),
        { ...fonts, max: 100, refLine: { value: 100, label: t("adherence.goalLine") }, fmtValue: (v) => `${v}` },
      ),
  });

  // ---------- strava po dňoch ----------
  const daily = nutrition.daily;
  w.chartCard({
    title: t("pdf.nutritionTitle"),
    aside: nutrition.avgKcal != null ? `${num(nutrition.avgKcal, 0)} kcal` : undefined,
    subtitle:
      nutrition.daysLogged > 0
        ? t("pdf.nutritionNote", { logged: nutrition.daysLogged, total: nutrition.daysTotal, within: nutrition.daysWithin })
        : t("nutrition.empty"),
    height: daily.length > 0 ? 120 : 6,
    draw: (page, box) => {
      if (daily.length === 0) return;
      drawBarChart(
        page,
        box,
        daily.map((d) => ({ label: String(Number(d.date.slice(8))), value: d.kcal })),
        {
          ...fonts,
          refLine: nutrition.kcalTarget ? { value: nutrition.kcalTarget, label: t("nutrition.targetLine", { kcal: num(nutrition.kcalTarget, 0) }) } : undefined,
          fmtValue: (v) => num(v, 0),
        },
      );
    },
  });

  // ---------- sila ----------
  const cmpCols: TableColumn[] = [
    { text: t("pdf.exercise"), width: 260 },
    { text: t("compare.start"), width: 100, align: "right" },
    { text: t("compare.end"), width: 100, align: "right" },
    { text: t("pdf.change"), width: 100, align: "right" },
  ];
  const cmpRow = (name: string, cmp: Comparison | null, unit: string) => ({
    cells: cmp
      ? [name, `${num(cmp.start)} ${unit}`, `${num(cmp.end)} ${unit}`, `${signed(cmp.delta)} ${unit}${cmp.pct != null ? ` (${signed(cmp.pct)} %)` : ""}`]
      : [name, "—", "—", "—"],
  });
  const strengthRows = report.strength.filter((s) => s.comparison).slice(0, 25);
  w.tableCard({
    title: t("pdf.strengthTitle"),
    aside: t("pdf.e1rm"),
    columns: cmpCols,
    rows: strengthRows.map((s) => cmpRow(s.name, s.comparison, "kg")),
    empty: t("progress.noStrength"),
  });

  // ---------- telesné miery ----------
  const measureRows = MEASURE_KEYS.filter((k) => k !== "weight" && report.comparisons[k]).map((k) =>
    cmpRow(t(`measures.${k}`), report.comparisons[k], UNIT[k]),
  );
  if (measureRows.length > 0) {
    w.tableCard({
      title: t("pdf.measuresTitle"),
      columns: [{ ...cmpCols[0], text: t("pdf.measure") }, ...cmpCols.slice(1)],
      rows: measureRows,
    });
  }

  return w.bytes();
}
