import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlanBuilder } from "./PlanBuilder";
import { PublishControl } from "./PublishControl";
import { SaveTemplateForm } from "../../sablony/SaveTemplateForm";
import type { WorkoutExerciseEntry } from "../actions";
import styles from "../../dashboard.module.css";

const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M9 3 4 7l5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// DEV náhľad buildera bez session (?preview=builder) — viac dní s rôzne dlhými
// názvami (test lámania piluliek) + deň so 6 cvikmi (test šípok poradia na kraji).
function previewEntry(i: number, name: string): WorkoutExerciseEntry {
  return { entry_id: `p${i}`, exercise_id: `x${i}`, exercise_name: name, sets: 3, reps: "8-10", load_kg: i % 2 ? 40 : null, tempo: null, rest_seconds: 90 };
}
const PREVIEW_DAYS = [
  { id: "d1", day_number: 1, name: "Deň 1 — Tlak (hrudník, ramená, triceps)", exercises: ["Bench press", "Tlaky nad hlavu", "Rozpažky s jednoručkami", "Francúzsky tlak", "Tlak na hrudník na stroji", "Kliky"].map((n, i) => previewEntry(i, n)) },
  { id: "d2", day_number: 2, name: "Deň 2 — Nohy a spodný chrbát", exercises: ["Drep s veľkou činkou", "Rumunský mŕtvy ťah", "Výpady"].map((n, i) => previewEntry(i + 10, n)) },
  { id: "d3", day_number: 3, name: "Deň 3 — Ťah (chrbát, biceps, zadné delty)", exercises: ["Zhyby", "Veslovanie v predklone", "Bicepsový zdvih"].map((n, i) => previewEntry(i + 20, n)) },
  { id: "d4", day_number: 4, name: "Deň 4 — Horná časť tela (silový mix) a core", exercises: ["Plank", "Mŕtvy ťah"].map((n, i) => previewEntry(i + 30, n)) },
];

export default async function PlanDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { planId } = await params;
  const { preview } = await searchParams;

  if (preview === "builder" && process.env.NODE_ENV !== "production") {
    return (
      <>
        <Link href="/dashboard/treningy" className={styles.backLink}>
          <BackIcon />
          Späť na tréningy
        </Link>
        <div className={styles.detailHead}>
          <div>
            <h1>AI plán — hypertrofia</h1>
            <div className={styles.clientGoal}>Ján Novák</div>
          </div>
          <PublishControl planId={planId} published={false} />
        </div>
        <PlanBuilder planId={planId} days={PREVIEW_DAYS} library={[]} />
      </>
    );
  }

  const supabase = await createClient();

  // `plan`, `days` aj `exercises` berú `planId`/nič z route parametra — nezávislé,
  // paralelne namiesto čakania na `plan` pred spustením zvyšných dvoch.
  const [{ data: plan }, { data: days }, { data: exercises }] = await Promise.all([
    supabase
      .from("workout_plans")
      // Explicitná FK: odkedy má `clients` aj `active_plan_id → workout_plans`
      // (0010_client_own_workouts.sql), je vzťah workout_plans↔clients nejednoznačný
      // a plain `clients(...)` embed padá na PGRST201 (a maybeSingle() to potichu
      // zmení na "nenájdené" — celá stránka detailu plánu bola nedostupná).
      .select("id, name, client_id, published, clients!workout_plans_client_id_fkey(full_name)")
      .eq("id", planId)
      .maybeSingle(),
    supabase.from("workout_days").select("id, day_number, name, exercises").eq("plan_id", planId).order("day_number"),
    supabase.from("exercises").select("id, name, name_sk, muscle_group, image_url").order("name"),
  ]);

  if (!plan) {
    notFound();
  }

  const clientName = (plan.clients as unknown as { full_name: string } | null)?.full_name ?? "?";

  return (
    <>
      <Link href="/dashboard/treningy" className={styles.backLink}>
        <BackIcon />
        Späť na tréningy
      </Link>

      <div className={styles.detailHead}>
        <div>
          <h1>{plan.name}</h1>
          <div className={styles.clientGoal}>
            <Link href={`/dashboard/klienti/${plan.client_id}`}>{clientName}</Link>
          </div>
        </div>
        <PublishControl planId={planId} published={plan.published} />
      </div>

      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <SaveTemplateForm kind="workout" planId={planId} defaultName={plan.name} />
        <a href={`/api/export/plan/${planId}/pdf`} className="btn btn-ghost btn-sm">
          Stiahnuť PDF
        </a>
      </div>

      <PlanBuilder planId={planId} days={days ?? []} library={exercises ?? []} />
    </>
  );
}
