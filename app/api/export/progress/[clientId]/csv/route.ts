// FitPilot — export histórie meraní klienta do CSV (feature/export-dat) — na
// ďalšiu analýzu v Exceli a pod. (na rozdiel od PDF, ktoré je hotový report).

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
  if (!user) return NextResponse.json({ error: "Nie si prihlásený." }, { status: 401 });

  const { data: client } = await supabase
    .from("clients")
    .select("id, full_name")
    .eq("id", clientId)
    .eq("trainer_id", user.id)
    .maybeSingle();
  if (!client) return NextResponse.json({ error: "Klient sa nenašiel." }, { status: 404 });

  const bodyMetrics = (await getBodyMetrics(clientId)) ?? [];

  const csv = toCsv(
    ["Dátum", "Váha (kg)", "Pás (cm)", "Hrudník (cm)", "Boky (cm)", "Paža (cm)", "Stehno (cm)", "Poznámka"],
    bodyMetrics.map((m) => [m.measuredOn, m.weightKg, m.waistCm, m.chestCm, m.hipsCm, m.armCm, m.thighCm, m.note]),
  );

  const fileName = `merania-${client.full_name.replace(/[^a-zA-Z0-9\-_ ]/g, "").trim() || "klient"}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
