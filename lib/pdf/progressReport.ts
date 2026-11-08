// FitPilot — export progresu klienta do PDF (feature/export-dat, vzhľad v6). Rovnaké zdroje
// dát ako AI zhrnutie (lib/ai/progressSummary.ts) — len iný výstup (report na
// stiahnutie/vytlačenie/poslanie klientovi mimo appky), nič nové sa nepočíta.

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

const WEIGHT_COLUMNS: TableColumn[] = [
  { text: "Dátum", width: 300, strong: false },
  { text: "Váha", width: 170, align: "right" },
];

const STRENGTH_COLUMNS: TableColumn[] = [
  { text: "Dátum", width: 230, strong: false },
  { text: "Záťaž", width: 120, align: "right" },
  { text: "Opakovania", width: 120, align: "right" },
];

export async function generateProgressPdf(input: ProgressReportInput): Promise<Uint8Array> {
  const ctx = await createPdfContext();
  const w = new PdfWriter(ctx, "Progres klienta");

  w.title({ title: input.clientName, meta: ["Adherencia tréningu a stravy, váha a silový progres"] });

  const tiles: Tile[] = [];
  const t = input.trainingAdherence;
  if (t) {
    tiles.push(
      { label: "Tréning · 30 dní", value: `${t.window30.pct} %`, sub: `${t.window30.trainedDays}/${t.window30.totalDays} dní` },
      { label: "Tréning · 90 dní", value: `${t.window90.pct} %`, sub: `${t.window90.trainedDays}/${t.window90.totalDays} dní` },
    );
  }
  const n = input.nutritionAdherence;
  if (n?.hasGoal) {
    tiles.push(
      { label: "Strava · 30 dní", value: `${n.window30.pct} %`, sub: `cieľ ${n.kcalGoal} kcal/deň` },
      { label: "Strava · 90 dní", value: `${n.window90.pct} %`, sub: `cieľ ${n.kcalGoal} kcal/deň` },
    );
  }
  w.tiles(tiles);
  if (!t || !n?.hasGoal) {
    const missing = [!t && "Adherencia tréningu je nedostupná.", !n?.hasGoal && "Klient nemá nastavený makro cieľ — adherencia stravy sa nepočíta."]
      .filter(Boolean)
      .join(" ");
    w.tableCard({ title: "Adherencia", columns: WEIGHT_COLUMNS, rows: [], empty: missing });
  }

  const withWeight = input.bodyMetrics.filter((m) => m.weightKg != null);
  // Najnovšie navrchu — čitateľnejšie pri dlhšej histórii ako scroll od najstaršieho.
  const weightRows = [...withWeight].reverse().slice(0, 40);
  const first = withWeight[0]?.weightKg;
  const latest = withWeight[withWeight.length - 1]?.weightKg;
  const delta = first != null && latest != null ? Math.round((latest - first) * 10) / 10 : null;
  w.tableCard({
    title: "História váhy",
    aside: delta != null && withWeight.length > 1 ? `zmena ${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta)} kg` : undefined,
    columns: WEIGHT_COLUMNS,
    rows: weightRows.map((m) => ({ cells: [skDate(m.measuredOn), `${m.weightKg} kg`] })),
    empty: "Zatiaľ žiadne merania.",
  });

  const strengthEntries = input.strengthNames
    .map((name) => ({ name, points: input.strengthByExercise[name] ?? [] }))
    .filter((e) => e.points.length > 0);

  if (strengthEntries.length > 0) w.section("Silový progres");
  for (const { name, points } of strengthEntries) {
    const best = Math.max(...points.map((p) => p.bestWeightKg));
    w.tableCard({
      title: name,
      aside: `max ${best} kg`,
      columns: STRENGTH_COLUMNS,
      rows: [...points].reverse().slice(0, 15).map((p) => ({ cells: [skDate(p.date), `${p.bestWeightKg} kg`, String(p.reps)] })),
    });
  }

  return w.bytes();
}
