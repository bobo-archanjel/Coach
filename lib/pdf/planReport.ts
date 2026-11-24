// FitPilot — export tréningového plánu do PDF (feature/export-dat, vzhľad v6).

import type { Locale } from "@/lib/i18n/locales";
import { createPdfContext, PdfWriter, type PdfBrand, type TableColumn } from "./document";
import { supersetPositions } from "@/lib/workouts/superset";

export interface PlanReportExercise {
  exerciseName: string;
  sets: number;
  reps: string;
  loadKg: number | null;
  tempo: string | null;
  restSeconds: number | null;
  /** superséria (lib/workouts/superset.ts) — v PDF štítok A1 / A2, pauza len po kole */
  superset?: string | null;
}

export interface PlanReportDay {
  name: string;
  exercises: PlanReportExercise[];
}

export interface PlanReportInput {
  planName: string;
  clientName: string;
  days: PlanReportDay[];
}


/** 45 s · 1 min · 1 min 15 s (predtým „1.3 min“) */
function restLabel(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${sec} s`;
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  return rest ? `${min} min ${rest} s` : `${min} min`;
}

export async function generatePlanPdf(input: PlanReportInput, locale: Locale = "sk", brand: PdfBrand | null = null): Promise<Uint8Array> {
  const ctx = await createPdfContext(locale, brand);
  const t = (key: Parameters<typeof ctx.t>[0], values?: Record<string, string | number>) => ctx.t(key, values);
  const COLUMNS: TableColumn[] = [
    { text: t("plan.exercise"), width: 170 },
    { text: t("plan.sets"), width: 40, align: "right" },
    { text: t("plan.reps"), width: 65, align: "right" },
    { text: t("plan.load"), width: 55, align: "right" },
    { text: t("plan.rest"), width: 50, align: "right" },
    // poznámka k cviku (v dátach `tempo`) — posledná, najširšia po názve
    { text: t("plan.note"), width: 110 },
  ];
  const w = new PdfWriter(ctx, t("plan.kind"));

  w.title({
    title: input.planName,
    meta: [t("client", { name: input.clientName })],
  });

  const exerciseCount = input.days.reduce((s, d) => s + d.exercises.length, 0);
  const setCount = input.days.reduce((s, d) => s + d.exercises.reduce((ss, e) => ss + (Number(e.sets) || 0), 0), 0);
  if (input.days.length > 0) {
    w.tiles([
      { label: t("plan.days"), value: String(input.days.length) },
      { label: t("plan.exercisesTotal"), value: String(exerciseCount) },
      { label: t("plan.setsTotal"), value: String(setCount) },
    ]);
  }

  if (input.days.length === 0) {
    w.tableCard({ title: t("plan.noDays"), columns: COLUMNS, rows: [], empty: t("plan.noDaysHint") });
  }

  for (const day of input.days) {
    const n = day.exercises.length;
    w.tableCard({
      title: day.name,
      aside: n > 0 ? t("plan.exerciseCount", { count: n }) : undefined,
      columns: COLUMNS,
      rows: day.exercises.map((ex, i) => {
        const ss = supersetPositions(day.exercises)[i];
        return {
          cells: [
            ss ? `${ss.letter}${ss.index} · ${ex.exerciseName}` : ex.exerciseName,
            String(ex.sets),
            ex.reps || "—",
            ex.loadKg != null ? `${ex.loadKg} kg` : "—",
            // superséria: medzi cvikmi bez pauzy, pauza až po kole
            ss && !ss.last ? "—" : restLabel(ex.restSeconds),
            ex.tempo || "—",
          ],
        };
      }),
      empty: t("plan.noExercises"),
    });
  }

  return w.bytes();
}
