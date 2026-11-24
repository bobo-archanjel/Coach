// FitPilot — mesačný report klienta (PDF s grafmi). Pokročilé reporty: tarifa Pro/Business.
// GET /api/export/report/<clientId>/pdf?month=YYYY-MM (bez parametra = aktuálny mesiac)

import { getTranslations } from "next-intl/server";
import { NextResponse } from "next/server";
import { getUserLocale } from "@/lib/i18n/server";
import { requireReports } from "@/lib/reports/guard";
import { buildClientReport } from "@/lib/reports/loaders";
import { currentMonth, isValidMonth, monthRange, todayIso } from "@/lib/reports/period";
import { safeFileName } from "@/lib/reports/csv";
import { generateClientReportPdf } from "@/lib/pdf/clientReport";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const t = await getTranslations("reports.errors");
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return NextResponse.json({ error: t("clientNotFound") }, { status: 404, headers: NO_STORE });

  const auth = await requireReports();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE });

  const today = todayIso();
  const requested = new URL(request.url).searchParams.get("month") ?? currentMonth(today);
  const range = isValidMonth(requested) ? monthRange(requested, today) : null;
  if (!range) return NextResponse.json({ error: t("invalidMonth") }, { status: 400, headers: NO_STORE });

  // vlastníctvo klienta: explicitný trainer_id v loaderi (+ RLS)
  const report = await buildClientReport(auth.supabase, auth.userId, clientId, { period: "month", range });
  if (!report) return NextResponse.json({ error: t("clientNotFound") }, { status: 404, headers: NO_STORE });

  const pdfBytes = await generateClientReportPdf({ report, month: requested }, await getUserLocale());
  const tc = await getTranslations("reports.csv");
  const fileName = `${tc("reportFile")}-${requested}-${safeFileName(report.clientName, tc("clientFallback"))}.pdf`;
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      ...NO_STORE,
    },
  });
}
