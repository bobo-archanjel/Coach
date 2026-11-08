// FitPilot — export tréningového plánu do PDF (feature/export-dat, vzhľad v6).

import { createPdfContext, PdfWriter, type TableColumn } from "./document";
import { pluralSk } from "@/lib/portal/streak";

export interface PlanReportExercise {
  exerciseName: string;
  sets: number;
  reps: string;
  loadKg: number | null;
  tempo: string | null;
  restSeconds: number | null;
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

const COLUMNS: TableColumn[] = [
  { text: "Cvik", width: 200 },
  { text: "Série", width: 45, align: "right" },
  { text: "Opakovania", width: 75, align: "right" },
  { text: "Záťaž", width: 60, align: "right" },
  { text: "Tempo", width: 55, align: "right" },
  { text: "Pauza", width: 55, align: "right" },
];

/** 45 s · 1 min · 1 min 15 s (predtým „1.3 min“) */
function restLabel(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${sec} s`;
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  return rest ? `${min} min ${rest} s` : `${min} min`;
}

export async function generatePlanPdf(input: PlanReportInput): Promise<Uint8Array> {
  const ctx = await createPdfContext();
  const w = new PdfWriter(ctx, "Tréningový plán");

  w.title({
    title: input.planName,
    meta: [`Klient: ${input.clientName}`],
  });

  const exerciseCount = input.days.reduce((s, d) => s + d.exercises.length, 0);
  const setCount = input.days.reduce((s, d) => s + d.exercises.reduce((ss, e) => ss + (Number(e.sets) || 0), 0), 0);
  if (input.days.length > 0) {
    w.tiles([
      { label: "Tréningové dni", value: String(input.days.length) },
      { label: "Cviky spolu", value: String(exerciseCount) },
      { label: "Série spolu", value: String(setCount) },
    ]);
  }

  if (input.days.length === 0) {
    w.tableCard({ title: "Plán zatiaľ nemá žiadne dni", columns: COLUMNS, rows: [], empty: "Pridaj dni a cviky v builderi plánu." });
  }

  for (const day of input.days) {
    const n = day.exercises.length;
    w.tableCard({
      title: day.name,
      aside: n > 0 ? `${n} ${pluralSk(n, "cvik", "cviky", "cvikov")}` : undefined,
      columns: COLUMNS,
      rows: day.exercises.map((ex) => ({
        cells: [
          ex.exerciseName,
          String(ex.sets),
          ex.reps || "—",
          ex.loadKg != null ? `${ex.loadKg} kg` : "—",
          ex.tempo || "—",
          restLabel(ex.restSeconds),
        ],
      })),
      empty: "Žiadne cviky.",
    });
  }

  return w.bytes();
}
