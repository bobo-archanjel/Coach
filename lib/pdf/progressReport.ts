// FitPilot — export progresu klienta do PDF (feature/export-dat). Rovnaké zdroje
// dát ako AI zhrnutie (lib/ai/progressSummary.ts) — len iný výstup (report na
// stiahnutie/vytlačenie/poslanie klientovi mimo appky), nič nové sa nepočíta.

import type { NutritionAdherence, TrainingAdherence } from "@/lib/dashboard/adherence";
import type { BodyMetricEntry, StrengthPoint } from "@/lib/dashboard/bodyMetrics";
import { createPdfContext, PdfWriter, truncate } from "./document";

export interface ProgressReportInput {
  clientName: string;
  trainingAdherence: TrainingAdherence | null;
  nutritionAdherence: NutritionAdherence | null;
  bodyMetrics: BodyMetricEntry[];
  strengthNames: string[];
  strengthByExercise: Record<string, StrengthPoint[]>;
}

export async function generateProgressPdf(input: ProgressReportInput): Promise<Uint8Array> {
  const ctx = await createPdfContext();
  const w = new PdfWriter(ctx, `Progres — ${input.clientName}`);

  w.heading(`Progres — ${truncate(input.clientName, 50)}`);
  w.text(`Vygenerované: ${new Date().toLocaleDateString("sk-SK")}`, { dim: true });
  w.spacer(6);

  w.divider();
  w.subheading("Adherencia tréningu");
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

  w.divider();
  w.subheading("Adherencia stravy");
  if (input.nutritionAdherence?.hasGoal) {
    w.text(`Kalorický cieľ: ${input.nutritionAdherence.kcalGoal} kcal/deň`);
    w.text(`30 dní: ${input.nutritionAdherence.window30.pct} %`);
    w.text(`90 dní: ${input.nutritionAdherence.window90.pct} %`);
  } else {
    w.text("Klient nemá nastavený makro cieľ.", { dim: true });
  }

  w.divider();
  w.subheading("História váhy");
  const withWeight = input.bodyMetrics.filter((m) => m.weightKg != null);
  if (withWeight.length > 0) {
    w.row(
      [
        { text: "Dátum", width: 100, bold: true },
        { text: "Váha", width: 80, bold: true },
      ],
      { dim: true },
    );
    // Najnovšie navrchu — čitateľnejšie pri dlhšej histórii ako scroll od najstaršieho.
    for (const m of [...withWeight].reverse().slice(0, 30)) {
      w.row([
        { text: m.measuredOn, width: 100 },
        { text: `${m.weightKg} kg`, width: 80 },
      ]);
    }
  } else {
    w.text("Zatiaľ žiadne merania.", { dim: true });
  }

  const strengthEntries = input.strengthNames
    .map((name) => ({ name, points: input.strengthByExercise[name] ?? [] }))
    .filter((e) => e.points.length > 0);

  if (strengthEntries.length > 0) {
    w.divider();
    w.subheading("Silový progres");
    for (const { name, points } of strengthEntries) {
      const first = points[0];
      const last = points[points.length - 1];
      w.text(truncate(name, 60), {});
      w.bullet(
        points.length > 1
          ? `${first.bestWeightKg} kg × ${first.reps} (${first.date}) → ${last.bestWeightKg} kg × ${last.reps} (${last.date})`
          : `${last.bestWeightKg} kg × ${last.reps} (${last.date})`,
      );
    }
  }

  return w.bytes();
}
