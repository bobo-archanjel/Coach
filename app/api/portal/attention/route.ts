// Dáta zvončeka upozornení klienta (NotificationBell v /portal). GET namiesto
// server action — rovnaký dôvod ako GET /api/dashboard/attention (trénerov
// zvonček): načítava sa po hydratácii, pri fokuse, zmene trasy, nie vo fronte
// server actions spolu so zápismi (napr. odoslanie správy v chate).

import { NextResponse } from "next/server";
import { loadPortalAttention } from "@/lib/portal/attentionData";

export async function GET() {
  return NextResponse.json({ data: await loadPortalAttention() });
}
