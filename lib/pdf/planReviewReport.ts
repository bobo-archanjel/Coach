// FitPilot — Report tréningového plánu do PDF (tréner, stránka Report → „Export PDF“).
// Rovnaké dáta ako stránka /dashboard/treningy/[planId]/report: vyhodnotenie (súhrn, úspechy,
// zistenia, ako sa klientovi cvičilo — lib/portal/planReview.ts), každý odcvičený tréning
// (plán vs. skutočnosť po sériách) a zostávajúce tréningy s plánovanými cvikmi.

import type { Locale } from "@/lib/i18n/locales";
import { intlLocale } from "@/lib/i18n/locales";
import type { PlanReview, ReviewInsight } from "@/lib/portal/planReview";
import type { CompareExercise, LoggedSetValues } from "@/lib/workouts/completed";
import { createPdfContext, PdfWriter, skDate, type TableColumn, type TableRow, type Tile } from "./document";

export interface ReportDoneDay {
  name: string;
  /** ISO čas dokončenia (posledný zápis dňa) */
  completedAt: string;
  rpe: number | null;
  note: string | null;
  exercises: CompareExercise[];
}

export interface ReportPlannedExercise {
  exerciseName: string;
  sets: number;
  reps: string;
  loadKg: number | null;
}

export interface ReportOpenDay {
  name: string;
  exercises: ReportPlannedExercise[];
}

export interface PlanReviewReportInput {
  planName: string;
  clientName: string;
  totalDays: number;
  review: PlanReview | null;
  /** odcvičené tréningy v poradí dní plánu */
  doneDays: ReportDoneDay[];
  /** ešte neodcvičené tréningy (plánované cviky) */
  openDays: ReportOpenDay[];
}

export async function generatePlanReviewPdf(input: PlanReviewReportInput, locale: Locale = "sk"): Promise<Uint8Array> {
  const ctx = await createPdfContext(locale);
  const t = (key: Parameters<typeof ctx.t>[0], values?: Record<string, string | number>) => ctx.t(key, values);
  const nf = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 });
  const kg = (n: number) => `${nf.format(n)} kg`;

  /** zapísaná séria: „10 × 30 kg“, „10 opak.“, „45 s“, „400 m“ */
  const actualLabel = (s: LoggedSetValues | null): string => {
    if (!s) return t("report.notLogged");
    const parts: string[] = [];
    if (s.reps != null && s.weight != null) parts.push(`${s.reps} × ${kg(s.weight)}`);
    else if (s.reps != null) parts.push(t("report.repsOnly", { reps: s.reps }));
    else if (s.weight != null) parts.push(kg(s.weight));
    if (s.durationS != null) parts.push(`${s.durationS} s`);
    if (s.distanceM != null) parts.push(`${nf.format(s.distanceM)} m`);
    return parts.join(" · ") || "—";
  };
  const plannedLabel = (p: { reps: string | null; loadKg: number | null } | null): string => {
    if (!p) return "—";
    if (p.reps && p.loadKg != null) return `${p.reps} × ${kg(p.loadKg)}`;
    return p.reps ?? (p.loadKg != null ? kg(p.loadKg) : "—");
  };

  const w = new PdfWriter(ctx, t("report.kind"));
  const review = input.review;
  const doneCount = input.doneDays.length;
  const meta = [t("client", { name: input.clientName })];
  if (review?.from && review.to) {
    meta.push(t("report.period", { from: skDate(review.from), to: skDate(review.to) }));
  }
  meta.push(
    doneCount === input.totalDays && input.totalDays > 0
      ? t("report.allDone")
      : t("report.progress", { done: doneCount, total: input.totalDays }),
  );
  w.title({ title: input.planName, meta });

  // ---- súhrn ----
  if (review) {
    const pct = review.plannedSets > 0 ? Math.round((review.plannedSetsDone / review.plannedSets) * 100) : null;
    const tiles: Tile[] = [
      { label: t("report.statWorkouts"), value: String(review.workouts) },
      {
        label: t("report.statPlannedSets"),
        value: review.plannedSets > 0 ? `${review.plannedSetsDone}/${review.plannedSets}` : "—",
        sub: pct != null ? `${pct} %` : undefined,
      },
      { label: t("report.statVolume"), value: kg(Math.round(review.volumeKg)) },
      { label: t("report.statRpe"), value: review.avgRpe != null ? `${nf.format(review.avgRpe)}/10` : "—" },
    ];
    w.tiles(tiles);

    if (review.records.length > 0) {
      const columns: TableColumn[] = [
        { text: t("report.exercise"), width: 200 },
        { text: t("report.bestSet"), width: 110, align: "right" },
        { text: t("report.gain"), width: 90, align: "right" },
        { text: t("report.date"), width: 80, align: "right" },
      ];
      w.tableCard({
        title: t("report.recordsTitle"),
        columns,
        rows: review.records.map((r) => ({
          cells: [r.name, `${kg(r.kg)} × ${r.reps}`, `+${kg(Math.round((r.kg - r.prevKg) * 10) / 10)}`, skDate(r.date)],
        })),
      });
    }

    if (review.insights.length > 0) {
      const insightText = (i: ReviewInsight) =>
        i.kind === "progress"
          ? t("report.insightProgress", { name: i.name, kg: nf.format(i.kg) })
          : i.kind === "moreReps"
            ? t("report.insightMoreReps", { name: i.name })
            : i.kind === "fewerSets"
              ? t("report.insightFewerSets", { name: i.name, done: i.done, planned: i.planned })
              : t("report.insightSkipped", { name: i.name, times: i.times });
      w.tableCard({
        title: t("report.insightsTitle"),
        columns: [{ text: t("report.insight"), width: 1, strong: false }],
        rows: review.insights.map((i) => ({ cells: [insightText(i)] })),
      });
    }

    if (review.timeline.length > 0) {
      w.tableCard({
        title: t("report.timelineTitle"),
        // poznámka klienta je celá pri tréningu nižšie (Odcvičené tréningy) — tu by sa skrátila
        columns: [
          { text: t("report.date"), width: 90, strong: false },
          { text: t("report.workout"), width: 290 },
          { text: t("report.rpe"), width: 100, align: "right" },
        ],
        rows: review.timeline.map((x) => ({
          cells: [skDate(x.date), x.dayName, x.rpe != null ? `${x.rpe}/10` : "—"],
        })),
      });
    }
  }

  // ---- odcvičené tréningy: plán vs. skutočnosť po sériách ----
  const SET_COLUMNS: TableColumn[] = [
    { text: t("report.exercise"), width: 205 },
    { text: t("report.set"), width: 40, align: "right" },
    { text: t("report.planned"), width: 105, align: "right" },
    { text: t("report.actual"), width: 130, align: "right" },
  ];
  if (input.doneDays.length > 0) w.section(t("report.doneTitle"));
  for (const day of input.doneDays) {
    const rows: TableRow[] = [];
    for (const ex of day.exercises) {
      // vynechaný cvik spozná tréner podľa „nezapísané“ pri sériách — bez prípony (skracovala názov)
      const name = ex.status === "extra" ? t("report.extra", { name: ex.name }) : ex.name;
      ex.rows.forEach((r, i) => {
        rows.push({ cells: [i === 0 ? name : "", String(r.index), plannedLabel(r.planned), actualLabel(r.actual)] });
      });
      if (ex.rows.length === 0) rows.push({ cells: [name, "", "—", "—"] });
    }
    const subtitle = [
      day.rpe != null ? t("report.rpeLine", { rpe: day.rpe }) : null,
      day.note ? `„${day.note}“` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    w.tableCard({
      title: day.name,
      aside: skDate(day.completedAt),
      subtitle: subtitle || undefined,
      columns: SET_COLUMNS,
      rows,
      empty: t("report.noValues"),
    });
  }

  // ---- zostávajúce tréningy (plán) ----
  const PLAN_COLUMNS: TableColumn[] = [
    { text: t("plan.exercise"), width: 220 },
    { text: t("plan.sets"), width: 60, align: "right" },
    { text: t("plan.reps"), width: 90, align: "right" },
    { text: t("plan.load"), width: 90, align: "right" },
  ];
  if (input.openDays.length > 0) w.section(t("report.openTitle"));
  for (const day of input.openDays) {
    w.tableCard({
      title: day.name,
      aside: t("report.notDone"),
      columns: PLAN_COLUMNS,
      rows: day.exercises.map((ex) => ({
        cells: [ex.exerciseName, String(ex.sets), ex.reps, ex.loadKg != null ? kg(ex.loadKg) : "—"],
      })),
      empty: t("plan.noExercises"),
    });
  }

  return w.bytes();
}
