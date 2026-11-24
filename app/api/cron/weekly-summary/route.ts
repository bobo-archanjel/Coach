// FitPilot — cron: týždenné zhrnutie e-mailom klientom (Vercel Cron, vercel.json).
// Chránené hlavičkou `Authorization: Bearer ${CRON_SECRET}` (Vercel ju pridáva automaticky, ak je
// CRON_SECRET nastavený v projekte). Bez nastaveného CRON_SECRET endpoint odmieta všetko (fail-closed).
// Idempotentné (jeden e-mail na klienta a týždeň), takže bezpečne sa dá spustiť aj ručne alebo opakovane.

import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { runWeeklySummaryJob } from "@/lib/mail/weeklyJob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 16) return false;
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  // porovnanie hashov = konštantný čas aj pri rôznej dĺžke
  const a = createHash("sha256").update(header.slice(7)).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const stats = await runWeeklySummaryJob({ budgetMs: 45_000 });
  return NextResponse.json(stats, { headers: { "Cache-Control": "no-store" } });
}
