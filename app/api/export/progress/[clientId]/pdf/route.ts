// FitPilot — export progresu klienta do PDF (feature/export-dat).

import { getTranslations } from "next-intl/server";
import { tErr } from "@/lib/i18n/serverErrors";
import { getUserLocale } from "@/lib/i18n/server";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getNutritionAdherence, getTrainingAdherence } from "@/lib/dashboard/adherence";
import { getBodyMetrics, getAllStrengthProgress } from "@/lib/dashboard/bodyMetrics";
import { generateProgressPdf } from "@/lib/pdf/progressReport";

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

  const [trainingAdherence, nutritionAdherence, bodyMetrics, strengthProgress] = await Promise.all([
    getTrainingAdherence(clientId),
    getNutritionAdherence(clientId),
    getBodyMetrics(clientId),
    getAllStrengthProgress(clientId),
  ]);

  const pdfBytes = await generateProgressPdf({
    clientName: client.full_name,
    trainingAdherence,
    nutritionAdherence,
    bodyMetrics: bodyMetrics ?? [],
    strengthNames: strengthProgress?.names ?? [],
    strengthByExercise: strengthProgress?.byExercise ?? {},
  }, await getUserLocale());

  const tc = await getTranslations("errors.csv");
  const fileName = `${tc("progressFile")}-${client.full_name.replace(/[^a-zA-Z0-9\-_ ]/g, "").trim() || tc("clientFallback")}.pdf`;
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
