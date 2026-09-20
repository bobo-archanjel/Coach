// FitPilot — export jedálničku do PDF (feature/funkcionalita). Rovnaký vzor ako
// app/api/export/plan/[planId]/pdf (Route Handler pre súborový download, vlastný
// auth guard — Route Handlery obchádzajú app/dashboard/layout.tsx).
//
// Na rozdiel od exportu tréningového plánu sem smie aj klient (jedálniček si
// stiahne vo svojom portáli). Prístup nehľadí na trainer_id v dopyte — rozhoduje
// RLS na meal_plans/meal_days (0005): riadok vidí len vlastník-tréner alebo
// klient, ktorému plán patrí. Cudzí používateľ dostane prázdny výsledok → 404.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateMealPlanPdf, type MealPlanReportEntry } from "@/lib/pdf/mealPlanReport";

export async function GET(_request: Request, { params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nie si prihlásený." }, { status: 401 });

  const { data: plan } = await supabase
    .from("meal_plans")
    .select("id, name, client_id, clients(full_name)")
    .eq("id", planId)
    .maybeSingle();
  if (!plan) return NextResponse.json({ error: "Jedálniček sa nenašiel." }, { status: 404 });

  const [{ data: days }, { data: profile }] = await Promise.all([
    supabase.from("meal_days").select("day_number, name, meals").eq("plan_id", planId).order("day_number"),
    supabase
      .from("nutrition_profiles")
      .select("calories_target, protein_g, carbs_g, fat_g")
      .eq("client_id", plan.client_id)
      .maybeSingle(),
  ]);

  const clientName = (plan.clients as unknown as { full_name: string } | null)?.full_name ?? "?";

  const pdfBytes = await generateMealPlanPdf({
    planName: plan.name,
    clientName,
    goal: profile
      ? {
          caloriesTarget: profile.calories_target,
          proteinG: profile.protein_g,
          carbsG: profile.carbs_g,
          fatG: profile.fat_g,
        }
      : null,
    days: (days ?? []).map((d) => ({
      name: d.name,
      meals: Array.isArray(d.meals) ? (d.meals as MealPlanReportEntry[]) : [],
    })),
  });

  const fileName = `${plan.name.replace(/[^a-zA-Z0-9\-_ ]/g, "").trim() || "jedalnicek"}.pdf`;
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
