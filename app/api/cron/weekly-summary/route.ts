// FitPilot — cron: týždenné zhrnutie e-mailom klientom (Vercel Cron, vercel.json).
// Chránené hlavičkou `Authorization: Bearer ${CRON_SECRET}` (Vercel ju pridáva automaticky, ak je
// CRON_SECRET nastavený v projekte). Bez nastaveného CRON_SECRET endpoint odmieta všetko (fail-closed).
// Idempotentné (jeden e-mail na klienta a týždeň), takže bezpečne sa dá spustiť aj ručne alebo opakovane.

import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { runWeeklySummaryJob } from "@/lib/mail/weeklyJob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const stats = await runWeeklySummaryJob({ budgetMs: 45_000 });
  return NextResponse.json(stats, { headers: { "Cache-Control": "no-store" } });
}
