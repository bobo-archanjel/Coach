// FitPilot — cron: automatické mazanie záujemcov z verejných stránok trénerov starších ako 12 mesiacov
// (GDPR, SQL purge_old_leads z migrácie 0083). Vercel Cron (vercel.json), chránené hlavičkou
// `Authorization: Bearer ${CRON_SECRET}`. Idempotentné — dá sa spustiť aj ručne.

import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { LEAD_RETENTION_MONTHS } from "@/lib/publicPage/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = tryCreateAdminClient();
  if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const { data, error } = await admin.rpc("purge_old_leads", { p_months: LEAD_RETENTION_MONTHS });
  if (error) {
    console.error("cron.leads-purge:", error.message);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  return NextResponse.json({ deleted: typeof data === "number" ? data : 0 }, { headers: { "Cache-Control": "no-store" } });
}
