// FitPilot — export histórie meraní klienta do CSV (feature/export-dat) — na
// ďalšiu analýzu v Exceli a pod. (na rozdiel od PDF, ktoré je hotový report).

import { getTranslations } from "next-intl/server";
import { tErr } from "@/lib/i18n/serverErrors";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBodyMetrics } from "@/lib/dashboard/bodyMetrics";
import { toCsv } from "@/lib/csv";

export async function GET(_request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: await tErr("notSignedIn") }, { status: 401 });

  const { data: client } = await supabase
    .from("clients")
    .select("id, full_name")
    .eq("id", clientId)
    .eq("trainer_id", user.id)
    .maybeSingle();
  if (!client) return NextResponse.json({ error: await tErr("api.clientNotFound") }, { status: 404 });

  const bodyMetrics = (await getBodyMetrics(clientId)) ?? [];

  const tc = await getTranslations("errors.csv");
  const csv = toCsv(
    [tc("date"), tc("weight"), tc("waist"), tc("chest"), tc("hips"), tc("arm"), tc("thigh"), tc("note")],
    bodyMetrics.map((m) => [m.measuredOn, m.weightKg, m.waistCm, m.chestCm, m.hipsCm, m.armCm, m.thighCm, m.note]),
  );

  const fileName = `${tc("measurementsFile")}-${client.full_name.replace(/[^a-zA-Z0-9\-_ ]/g, "").trim() || tc("clientFallback")}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
