// FitPilot — export progresu klienta do PDF (feature/export-dat, vzhľad v6). Rovnaké zdroje
// dát ako AI zhrnutie (lib/ai/progressSummary.ts) — len iný výstup (report na
// stiahnutie/vytlačenie/poslanie klientovi mimo appky), nič nové sa nepočíta.

import type { Locale } from "@/lib/i18n/locales";
import type { NutritionAdherence, TrainingAdherence } from "@/lib/dashboard/adherence";
import type { BodyMetricEntry, StrengthPoint } from "@/lib/dashboard/bodyMetrics";
import { createPdfContext, PdfWriter, skDate, type TableColumn, type Tile } from "./document";

export interface ProgressReportInput {
  clientName: string;
  trainingAdherence: TrainingAdherence | null;
  nutritionAdherence: NutritionAdherence | null;
  bodyMetrics: BodyMetricEntry[];
  strengthNames: string[];
  strengthByExercise: Record<string, StrengthPoint[]>;
}


export async function generateProgressPdf(input: ProgressReportInput, locale: Locale = "sk"): Promise<Uint8Array> {
  const ctx = await createPdfContext(locale);
  const tt = (key: Parameters<typeof ctx.t>[0], values?: Record<string, string | number>) => ctx.t(key, values);
  const WEIGHT_COLUMNS: TableColumn[] = [
    { text: tt("progress.date"), width: 300, strong: false },
    { text: tt("progress.weight"), width: 170, align: "right" },
  ];
  const STRENGTH_COLUMNS: TableColumn[] = [
    { text: tt("progress.date"), width: 230, strong: false },
    { text: tt("progress.load"), width: 120, align: "right" },
    { text: tt("progress.reps"), width: 120, align: "right" },
  ];
  const w = new PdfWriter(ctx, tt("progress.kind"));

  w.title({ title: input.clientName, meta: [tt("progress.subtitle")] });

  const tiles: Tile[] = [];
  const t = input.trainingAdherence;
  if (t) {
    tiles.push(
      {
        label: tt("progress.training30"),
        value: `${t.window30.pct} %`,
        sub: tt("progress.days", { done: t.window30.trainedDays, total: t.window30.totalDays }),
      },
      {
        label: tt("progress.training90"),
        value: `${t.window90.pct} %`,
        sub: tt("progress.days", { done: t.window90.trainedDays, total: t.window90.totalDays }),
      },
    );
  }
  const n = input.nutritionAdherence;
  if (n?.hasGoal) {
    tiles.push(
      { label: tt("progress.nutrition30"), value: `${n.window30.pct} %`, sub: tt("progress.goal", { kcal: n.kcalGoal ?? 0 }) },
      { label: tt("progress.nutrition90"), value: `${n.window90.pct} %`, sub: tt("progress.goal", { kcal: n.kcalGoal ?? 0 }) },
    );
  }
  w.tiles(tiles);
  if (!t || !n?.hasGoal) {
    const missing = [!t && tt("progress.trainingUnavailable"), !n?.hasGoal && tt("progress.noMacroGoal")]
      .filter(Boolean)
      .join(" ");
    w.tableCard({ title: tt("progress.adherence"), columns: WEIGHT_COLUMNS, rows: [], empty: missing });
  }

  const withWeight = input.bodyMetrics.filter((m) => m.weightKg != null);
  // Najnovšie navrchu — čitateľnejšie pri dlhšej histórii ako scroll od najstaršieho.
  const weightRows = [...withWeight].reverse().slice(0, 40);
  const first = withWeight[0]?.weightKg;
  const latest = withWeight[withWeight.length - 1]?.weightKg;
  const delta = first != null && latest != null ? Math.round((latest - first) * 10) / 10 : null;
  w.tableCard({
    title: tt("progress.weightHistory"),
    aside:
      delta != null && withWeight.length > 1
        ? tt("progress.change", { delta: `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta)}` })
        : undefined,
    columns: WEIGHT_COLUMNS,
    rows: weightRows.map((m) => ({ cells: [skDate(m.measuredOn), `${m.weightKg} kg`] })),
    empty: tt("progress.noMeasurements"),
  });

  const strengthEntries = input.strengthNames
    .map((name) => ({ name, points: input.strengthByExercise[name] ?? [] }))
    .filter((e) => e.points.length > 0);

  if (strengthEntries.length > 0) w.section(tt("progress.strength"));
  for (const { name, points } of strengthEntries) {
    const best = Math.max(...points.map((p) => p.bestWeightKg));
    w.tableCard({
      title: name,
      aside: tt("progress.max", { kg: best }),
      columns: STRENGTH_COLUMNS,
      rows: [...points].reverse().slice(0, 15).map((p) => ({ cells: [skDate(p.date), `${p.bestWeightKg} kg`, String(p.reps)] })),
    });
  }

  return w.bytes();
}
