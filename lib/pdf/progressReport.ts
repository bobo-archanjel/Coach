// FitPilot — export progresu klienta do PDF (feature/export-dat). Rovnaké zdroje
// dát ako AI zhrnutie (lib/ai/progressSummary.ts) — len iný výstup (report na
// stiahnutie/vytlačenie/poslanie klientovi mimo appky), nič nové sa nepočíta.

import type { NutritionAdherence, TrainingAdherence } from "@/lib/dashboard/adherence";
import type { BodyMetricEntry, StrengthPoint } from "@/lib/dashboard/bodyMetrics";
import { createPdfContext, PdfWriter, truncate, type TableColumn } from "./document";

export interface ProgressReportInput {
  clientName: string;
  trainingAdherence: TrainingAdherence | null;
  nutritionAdherence: NutritionAdherence | null;
  bodyMetrics: BodyMetricEntry[];
  strengthNames: string[];
  strengthByExercise: Record<string, StrengthPoint[]>;
}

const WEIGHT_COLUMNS: TableColumn[] = [
  { text: "Dátum", width: 150 },
  { text: "Váha", width: 100, align: "right" },
];

const STRENGTH_COLUMNS: TableColumn[] = [
  { text: "Dátum", width: 130 },
  { text: "Záťaž", width: 100 },
  { text: "Opakovania", width: 120, align: "right" },
];

export async function generateProgressPdf(input: ProgressReportInput): Promise<Uint8Array> {
  const ctx = await createPdfContext();
  const w = new PdfWriter(ctx);

  w.heading(`Progres — ${truncate(input.clientName, 50)}`);
  w.meta(`Vygenerované: ${new Date().toLocaleDateString("sk-SK")}`);

  w.section("Adherencia tréningu");
  if (input.trainingAdherence) {
    w.text(
      `30 dní: ${input.trainingAdherence.window30.pct} % (${input.trainingAdherence.window30.trainedDays}/${input.trainingAdherence.window30.totalDays} dní)`,
    );
    w.text(
      `90 dní: ${input.trainingAdherence.window90.pct} % (${input.trainingAdherence.window90.trainedDays}/${input.trainingAdherence.window90.totalDays} dní)`,
    );
  } else {
    w.text("Nedostupné.", { dim: true });
  }

  w.section("Adherencia stravy");
  if (input.nutritionAdherence?.hasGoal) {
    w.text(`Kalorický cieľ: ${input.nutritionAdherence.kcalGoal} kcal/deň`);
    w.text(`30 dní: ${input.nutritionAdherence.window30.pct} %`);
    w.text(`90 dní: ${input.nutritionAdherence.window90.pct} %`);
  } else {
    w.text("Klient nemá nastavený makro cieľ.", { dim: true });
  }

  w.section("História váhy");
  const withWeight = input.bodyMetrics.filter((m) => m.weightKg != null);
  if (withWeight.length > 0) {
    // Najnovšie navrchu — čitateľnejšie pri dlhšej histórii ako scroll od najstaršieho.
    const rows = [...withWeight].reverse().slice(0, 40);
    w.table(
      WEIGHT_COLUMNS,
      rows.map((m) => [m.measuredOn, `${m.weightKg} kg`]),
    );
  } else {
    w.text("Zatiaľ žiadne merania.", { dim: true });
  }

  const strengthEntries = input.strengthNames
    .map((name) => ({ name, points: input.strengthByExercise[name] ?? [] }))
    .filter((e) => e.points.length > 0);

  if (strengthEntries.length > 0) {
    w.section("Silový progres");
    for (const { name, points } of strengthEntries) {
      w.subtext(truncate(name, 60));
      const rows = [...points].reverse().slice(0, 15);
      w.table(
        STRENGTH_COLUMNS,
        rows.map((p) => [p.date, `${p.bestWeightKg} kg`, String(p.reps)]),
      );
    }
  }

  return w.bytes();
}
