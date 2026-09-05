// FitPilot — export tréningového plánu do PDF (feature/export-dat). Route Handler
// namiesto Server Action — súborový download potrebuje vlastnú HTTP odpoveď
// (Content-Disposition), Server Action to nevie priamo vrátiť prehliadaču.
// Auth guard je tu vlastný (Route Handlery obchádzajú app/dashboard/layout.tsx).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generatePlanPdf } from "@/lib/pdf/planReport";

// Tvar jsonb v workout_days.exercises (viď WorkoutExerciseEntry, treningy/actions.ts) — snake_case.
interface RawExercise {
  exercise_name: string;
  sets: number;
  reps: string;
  load_kg: number | null;
  tempo: string | null;
  rest_seconds: number | null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nie si prihlásený." }, { status: 401 });

  const { data: plan } = await supabase
    .from("workout_plans")
    .select("id, name, trainer_id, clients!workout_plans_client_id_fkey(full_name)")
    .eq("id", planId)
    .eq("trainer_id", user.id)
    .maybeSingle();
  if (!plan) return NextResponse.json({ error: "Plán sa nenašiel." }, { status: 404 });

  const { data: days } = await supabase
    .from("workout_days")
    .select("day_number, name, exercises")
    .eq("plan_id", planId)
    .order("day_number");

  const clientName = (plan.clients as unknown as { full_name: string } | null)?.full_name ?? "?";

  const pdfBytes = await generatePlanPdf({
    planName: plan.name,
    clientName,
    days: (days ?? []).map((d) => ({
      name: d.name,
      exercises: (Array.isArray(d.exercises) ? (d.exercises as RawExercise[]) : []).map((ex) => ({
        exerciseName: ex.exercise_name,
        sets: ex.sets,
        reps: ex.reps,
        loadKg: ex.load_kg,
        tempo: ex.tempo,
        restSeconds: ex.rest_seconds,
      })),
    })),
  });

  const fileName = `${plan.name.replace(/[^a-zA-Z0-9\-_ ]/g, "").trim() || "plan"}.pdf`;
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
