// FitPilot — CSV súhrn portfólia klientov (Pokročilé reporty). GET /api/export/report/portfolio/csv

import { getTranslations } from "next-intl/server";
import { NextResponse } from "next/server";
import { requireReports } from "@/lib/reports/guard";
import { buildPortfolioReport } from "@/lib/reports/loaders";
import { buildCsv } from "@/lib/reports/csv";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const auth = await requireReports();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE });

  const report = await buildPortfolioReport(auth.supabase, auth.userId);
  const t = await getTranslations("reports.errors");
  if (!report) return NextResponse.json({ error: t("loadFailed") }, { status: 500, headers: NO_STORE });

  const c = await getTranslations("reports.csv");
  const tr = await getTranslations("reports.risk");
  const status = await getTranslations("analytics");

  type Cell = string | number | boolean | null;
  const rows: Cell[][] = [
    [
      c("client"),
      c("pairedOn"),
      c("training30"),
      c("nutrition30"),
      c("plan30"),
      c("score"),
      c("status"),
      c("lastWorkout"),
      c("lastFood"),
      c("sessions14"),
      c("weightDelta"),
      c("atRisk"),
      c("reasons"),
    ],
  ];
  for (const cl of report.clients) {
    rows.push([
      cl.name,
      cl.pairedOn,
      cl.trainingPct30,
      cl.nutritionPct30,
      cl.planPct30,
      cl.score,
      status(cl.status),
      cl.lastTrainedOn,
      cl.lastFoodOn,
      cl.sessions14,
      cl.weightDeltaKg,
      cl.risk.atRisk ? c("yes") : c("no"),
      cl.risk.reasons.map((r) => tr(`short.${r}`, { days: cl.risk.daysInactive ?? 0 })).join(" | "),
    ]);
  }

  return new NextResponse(buildCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${c("portfolioFile")}-${report.today}.csv"`,
      ...NO_STORE,
    },
  });
}
