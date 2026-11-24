// FitPilot — Report tréningového plánu do PDF (tréner, stránka Report → „Export PDF“):
// vyhodnotenie (súhrn, úspechy, zistenia, ako sa klientovi cvičilo), odcvičené tréningy
// (plán vs. skutočnosť po sériách) a zostávajúce tréningy. Route Handler kvôli
// Content-Disposition; auth guard vlastný (Route Handlery obchádzajú layout dashboardu).

import { tErr } from "@/lib/i18n/serverErrors";
import { getUserLocale } from "@/lib/i18n/server";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlanReview } from "@/lib/portal/planReviewData";
import { buildDoneDays, fetchPlanLogs } from "@/lib/dashboard/planDoneDays";
import { generatePlanReviewPdf } from "@/lib/pdf/planReviewReport";

// Tvar jsonb v workout_days.exercises (WorkoutExerciseEntry, treningy/actions.ts) — snake_case.
interface RawExercise {
  exercise_name: string;
  sets: number;
  reps: string;
  load_kg: number | null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: await tErr("notSignedIn") }, { status: 401 });

  const [{ data: plan }, { data: days }, { data: logs }, review, locale] = await Promise.all([
    supabase
      .from("workout_plans")
      .select("id, name, trainer_id, clients!workout_plans_client_id_fkey(full_name)")
      .eq("id", planId)
      .eq("trainer_id", user.id)
      .maybeSingle(),
    supabase.from("workout_days").select("id, day_number, name, exercises").eq("plan_id", planId).order("day_number"),
    fetchPlanLogs(supabase, planId),
    getPlanReview(planId),
    getUserLocale(),
  ]);
  if (!plan) return NextResponse.json({ error: await tErr("planNotFound") }, { status: 404 });

  const clientName = (plan.clients as unknown as { full_name: string } | null)?.full_name ?? "?";
  const planDays = days ?? [];
  const done = buildDoneDays(logs ?? []);

  const pdfBytes = await generatePlanReviewPdf(
    {
      planName: plan.name,
      clientName,
      totalDays: planDays.length,
      review,
      doneDays: planDays
        .filter((d) => done[d.id])
        .map((d) => {
          const log = done[d.id];
          return { name: d.name, completedAt: log.completedAt, rpe: log.rpe, note: log.note, exercises: log.compare.exercises };
        }),
      openDays: planDays
        .filter((d) => !done[d.id])
        .map((d) => ({
          name: d.name,
          exercises: (Array.isArray(d.exercises) ? (d.exercises as RawExercise[]) : []).map((ex) => ({
            exerciseName: ex.exercise_name,
            sets: ex.sets,
            reps: ex.reps,
            loadKg: ex.load_kg,
          })),
        })),
    },
    locale,
  );

  const base = plan.name.replace(/[^a-zA-Z0-9\-_ ]/g, "").trim() || "plan";
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${base} - report.pdf"`,
    },
  });
}
