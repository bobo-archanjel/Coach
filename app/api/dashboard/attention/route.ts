// Dáta zvončeka upozornení trénera (NotificationBell). GET namiesto server action:
// zvonček sa načítava po hydratácii, pri zmene trasy, fokuse a novej správe — ako
// server action čakal vo fronte s ukladaním v builderi či odoslaním správy a
// navigácia počas neho vynútila ďalší plný refresh stránky. Session lokálne cez
// getClaims (lib/dashboard/attentionData → getUser).

import { NextResponse } from "next/server";
import { loadAttention } from "@/lib/dashboard/attentionData";

export async function GET() {
  return NextResponse.json({ data: await loadAttention() });
}
