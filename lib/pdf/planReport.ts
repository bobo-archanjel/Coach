// FitPilot — export tréningového plánu do PDF (feature/export-dat).

import { createPdfContext, PdfWriter, truncate, type TableColumn } from "./document";

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
  { text: "Cvik", width: 220 },
  { text: "Série", width: 55 },
  { text: "Opakovania", width: 90 },
  { text: "Záťaž", width: 75 },
  { text: "Pauza", width: 65, align: "right" },
];

function restLabel(sec: number | null): string {
  if (sec == null) return "—";
  return sec >= 60 ? `${Math.round((sec / 60) * 10) / 10} min` : `${sec} s`;
}

export async function generatePlanPdf(input: PlanReportInput): Promise<Uint8Array> {
  const ctx = await createPdfContext();
  const w = new PdfWriter(ctx);

  w.heading(truncate(input.planName, 60));
  w.meta(`Klient: ${input.clientName}  ·  Vygenerované: ${new Date().toLocaleDateString("sk-SK")}`);

  if (input.days.length === 0) {
    w.text("Plán zatiaľ nemá žiadne dni.", { dim: true });
  }

  for (const day of input.days) {
    w.section(truncate(day.name, 70));

    if (day.exercises.length === 0) {
      w.text("Žiadne cviky.", { dim: true });
      continue;
    }

    w.table(
      COLUMNS,
      day.exercises.map((ex) => [
        truncate(ex.exerciseName, 34),
        String(ex.sets),
        ex.reps,
        ex.loadKg != null ? `${ex.loadKg} kg` : "—",
        restLabel(ex.restSeconds),
      ]),
    );
  }

  return w.bytes();
}
