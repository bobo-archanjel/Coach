// FitPilot — export tréningového plánu do PDF (feature/export-dat).

import { createPdfContext, PdfWriter, truncate } from "./document";

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

function restLabel(sec: number | null): string {
  if (sec == null) return "—";
  return sec >= 60 ? `${Math.round((sec / 60) * 10) / 10} min` : `${sec} s`;
}

export async function generatePlanPdf(input: PlanReportInput): Promise<Uint8Array> {
  const ctx = await createPdfContext();
  const w = new PdfWriter(ctx, input.planName);

  w.heading(truncate(input.planName, 60));
  w.text(`Klient: ${input.clientName}`, { dim: true });
  w.text(`Vygenerované: ${new Date().toLocaleDateString("sk-SK")}`, { dim: true });
  w.spacer(6);

  if (input.days.length === 0) {
    w.text("Plán zatiaľ nemá žiadne dni.");
  }

  for (const day of input.days) {
    w.divider();
    w.subheading(truncate(day.name, 70));

    if (day.exercises.length === 0) {
      w.text("Žiadne cviky.", { dim: true });
      continue;
    }

    w.row(
      [
        { text: "Cvik", width: 220, bold: true },
        { text: "Série", width: 60, bold: true },
        { text: "Opakovania", width: 90, bold: true },
        { text: "Záťaž", width: 80, bold: true },
        { text: "Pauza", width: 60, bold: true },
      ],
      { dim: true },
    );

    for (const ex of day.exercises) {
      w.row([
        { text: truncate(ex.exerciseName, 34), width: 220 },
        { text: String(ex.sets), width: 60 },
        { text: ex.reps, width: 90 },
        { text: ex.loadKg != null ? `${ex.loadKg} kg` : "—", width: 80 },
        { text: restLabel(ex.restSeconds), width: 60 },
      ]);
    }
  }

  return w.bytes();
}
