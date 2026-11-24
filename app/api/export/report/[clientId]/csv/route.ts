// FitPilot — CSV export reportu jedného klienta (adherencia po týždňoch, telo, sila, strava).
// GET /api/export/report/<clientId>/csv?period=4|12|26|all

import { getTranslations } from "next-intl/server";
import { NextResponse } from "next/server";
import { requireReports } from "@/lib/reports/guard";
import { loadClientPeriodReport } from "@/lib/reports/loaders";
import { parsePeriod } from "@/lib/reports/period";
import { buildCsv, safeFileName } from "@/lib/reports/csv";
import { MEASURE_KEYS } from "@/lib/reports/types";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const t = await getTranslations("reports.errors");
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return NextResponse.json({ error: t("clientNotFound") }, { status: 404, headers: NO_STORE });

  const auth = await requireReports();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE });

  const period = parsePeriod(new URL(request.url).searchParams.get("period"));
  const report = await loadClientPeriodReport(auth.supabase, auth.userId, clientId, period);
  if (!report) return NextResponse.json({ error: t("clientNotFound") }, { status: 404, headers: NO_STORE });

  const c = await getTranslations("reports.csv");
  const tm = await getTranslations("reports.measures");

  type Cell = string | number | null;
  const rows: Cell[][] = [];
  rows.push([c("client"), report.clientName]);
  rows.push([c("period"), `${report.from} – ${report.to}`]);
  rows.push([]);

  rows.push([c("sections.weekly")]);
  rows.push([c("weekStart"), c("sessions"), c("target"), c("pct")]);
  for (const w of report.training.weeks) rows.push([w.weekStart, w.sessions, w.target, w.pct]);
  rows.push([]);

  rows.push([c("sections.body")]);
  rows.push([c("date"), ...MEASURE_KEYS.map((k) => `${tm(k)} (${k === "weight" ? "kg" : "cm"})`)]);
  const dates = [...new Set(MEASURE_KEYS.flatMap((k) => report.measures[k].map((p) => p.date)))].sort();
  for (const d of dates) rows.push([d, ...MEASURE_KEYS.map((k) => report.measures[k].find((p) => p.date === d)?.value ?? null)]);
  rows.push([]);

  rows.push([c("sections.strength")]);
  rows.push([c("exercise"), c("date"), c("weightKg"), c("reps"), c("e1rm")]);
  for (const s of report.strength) for (const p of s.points) rows.push([s.name, p.date, p.weightKg, p.reps, p.value]);
  rows.push([]);

  rows.push([c("sections.nutrition")]);
  rows.push([c("weekStart"), c("avgKcal"), c("daysLogged"), c("targetKcal")]);
  for (const w of report.nutrition.weekly) rows.push([w.weekStart, w.avgKcal, w.daysLogged, report.nutrition.kcalTarget]);

  const fileName = `${c("reportFile")}-${safeFileName(report.clientName, c("clientFallback"))}-${period}.csv`;
  return new NextResponse(buildCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      ...NO_STORE,
    },
  });
}
