import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlanBuilder } from "./PlanBuilder";
import { PublishActions, PublishBadge } from "./PublishControl";
import { WorkoutTemplateTop } from "../../sablony/WorkoutTemplateControls";
import { PlanTitle } from "./PlanTitle";
import type { WorkoutExerciseEntry } from "../actions";
import { formatCompletedDate, parsePlanSnapshot } from "@/lib/workouts/completed";
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

const PREVIEW_LIBRARY = [
  { id: "lib1", name: "Barbell Hip Thrust", name_sk: "Hip thrust s činkou", muscle_group: "zadok", image_url: [] },
  { id: "lib2", name: "Farmer's Walk", name_sk: "Farmárska chôdza", muscle_group: "predlaktia", image_url: [] },
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

  // ?preview=builder_empty — nový plán bez dní (hláška pri kliku na cvik bez dňa).
  if ((preview === "builder" || preview === "builder_empty") && process.env.NODE_ENV === "development") {
    return (
      <>
        <Link href="/dashboard/treningy" className={styles.backLink}>
          <BackIcon />
          Späť na tréningy
        </Link>
        <div className={styles.detailHead}>
          <div className={styles.detailTitle}>
            <PlanTitle planId={planId} name="AI plán — hypertrofia" />
            <div className={styles.clientGoal}>Ján Novák</div>
          </div>
          <PublishBadge published={false} />
        </div>
        <div className={styles.planActions}>
          <PublishActions planId={planId} published={false} />
        </div>
        <PlanBuilder
          planId={planId}
          days={preview === "builder_empty" ? [] : PREVIEW_DAYS}
          library={PREVIEW_LIBRARY}
          completedDayIds={["d2"]}
        />
      </>
    );
  }

  const supabase = await createClient();

  // `plan`, `days` aj `exercises` berú `planId`/nič z route parametra — nezávislé,
  // paralelne namiesto čakania na `plan` pred spustením zvyšných dvoch.
  const [{ data: plan }, { data: days }, { data: exercises }, { data: completedLogs }] = await Promise.all([
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
    // Odcvičené tréningy z tohto plánu — podľa snapshotu (0048), nie workout_day_id,
    // aby sa ukázali aj po zmazaní dňa. Zamknuté, každý má vlastný detail plán/realita.
    supabase
      .from("workout_logs")
      .select("id, completed_at, performed_on, plan_snapshot")
      .eq("plan_snapshot->>plan_id", planId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(20),
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
        <div className={styles.detailTitle}>
          <PlanTitle planId={planId} name={plan.name} />
          <div className={styles.clientGoal}>
            <Link href={`/dashboard/klienti/${plan.client_id}`}>{clientName}</Link>
          </div>
        </div>
        <PublishBadge published={plan.published} />
      </div>

      {/* Publikovanie aj šablóna v rovnakej 2-stĺpcovej mriežke pod sebou — súmerné tlačidlá. */}
      <div className={styles.planActions}>
        <PublishActions planId={planId} published={plan.published} />
        <WorkoutTemplateTop planId={planId} defaultName={plan.name} />
      </div>

      {completedLogs && completedLogs.length > 0 && (
        <p className={styles.planLockedHint}>
          Klient už z tohto plánu cvičil. Úpravy sa prejavia len v ďalších tréningoch — odcvičené tréningy ostávajú
          uložené presne tak, ako ich klient zapísal.
        </p>
      )}

      <PlanBuilder
        planId={planId}
        days={days ?? []}
        library={exercises ?? []}
        completedDayIds={(completedLogs ?? [])
          .map((l) => parsePlanSnapshot(l.plan_snapshot)?.dayId)
          .filter((id): id is string => Boolean(id))}
      />

      {completedLogs && completedLogs.length > 0 && (
        <section className={styles.card} style={{ marginTop: 20 }}>
          <h3>Odcvičené tréningy</h3>
          <div className={styles.roster}>
            {completedLogs.map((log) => (
              <Link
                key={log.id}
                href={`/dashboard/klienti/${plan.client_id}/treningy/${log.id}`}
                className={styles.logLinkRow}
              >
                <span className={styles.clientName}>{parsePlanSnapshot(log.plan_snapshot)?.dayName ?? "Tréning"}</span>
                <span className={`${styles.statusChip} ${styles.active}`}>
                  Dokončený – {formatCompletedDate(log.completed_at ?? `${log.performed_on}T12:00:00Z`)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Menej časté akcie na spodku (prehľadnejší vrch stránky, hlavne na mobile). */}
      <div className={styles.planFooterActions}>
        <div className={styles.templateGrid}>
          <a href={`/api/export/plan/${planId}/pdf`} className="btn btn-ghost btn-sm">
            Stiahnuť PDF
          </a>
        </div>
      </div>
    </>
  );
}
