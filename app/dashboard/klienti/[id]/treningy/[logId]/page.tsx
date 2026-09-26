import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  comparePlanWithActual,
  formatCompletedDate,
  formatDistance,
  formatDuration,
  parseLoggedEntries,
  parsePlanSnapshot,
  rowTone,
  type CompareExercise,
  type CompareRow,
  type PlanSnapshot,
  type SnapshotExercise,
} from "@/lib/workouts/completed";
import dashboardStyles from "../../../../dashboard.module.css";
import styles from "./completed.module.css";
import { DuplicateWorkoutButton } from "./DuplicateWorkoutButton";

const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M9 3 4 7l5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const LockIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

interface CompletedWorkoutView {
  logId: string;
  clientId: string;
  clientName: string;
  status: string;
  completedAt: string | null;
  performedOn: string;
  rpe: number | null;
  note: string | null;
  snapshot: PlanSnapshot | null;
  exercises: CompareExercise[];
}

// DEV náhľad bez session (?preview=done) — plán vs. realita vrátane cviku mimo
// plánu, vynechaného cviku, série navyše a poznámok (e2e/training-done.spec.ts).
function previewView(clientId: string, logId: string): CompletedWorkoutView {
  const snapshot = parsePlanSnapshot({
    plan_id: "preview-plan",
    plan_name: "Silový 3× týždenne",
    day_id: "preview-day",
    day_name: "Deň A — Nohy",
    backfilled: false,
    exercises: [
      { entry_id: "e1", exercise_id: null, exercise_name: "Drep s činkou", sets: 3, reps: "8", load_kg: 60, tempo: "3-0-1", rest_seconds: 120 },
      { entry_id: "e2", exercise_id: null, exercise_name: "Rumunský mŕtvy ťah", sets: 3, reps: "8-10", load_kg: 70, tempo: null, rest_seconds: 90 },
      { entry_id: "e3", exercise_id: null, exercise_name: "Lýtka v stoji", sets: 2, reps: "15", load_kg: null, tempo: null, rest_seconds: 60 },
    ],
  });
  const entries = parseLoggedEntries([
    { entryId: "e1", name: "Drep s činkou", sets: [{ reps: 8, weight: 60 }, { reps: 8, weight: 62.5 }, { reps: 6, weight: 62.5, rpe: 9 }, { reps: 5, weight: 60 }] },
    { entryId: "e2", name: "Rumunský mŕtvy ťah", note: "Bolel ma spodný chrbát, znížil som váhu.", sets: [{ reps: 10, weight: 65 }, { reps: 10, weight: 65 }] },
    { entryId: null, name: "Bicykel", sets: [{ reps: null, weight: null, durationS: 600, distanceM: 4200 }] },
  ]);
  return {
    logId,
    clientId,
    clientName: "Ján Novák",
    status: "completed",
    completedAt: "2026-09-24T17:42:00Z",
    performedOn: "2026-09-24",
    rpe: 8,
    note: "Dobrý tréning, len chrbát trochu tlačil.",
    snapshot,
    exercises: comparePlanWithActual(snapshot, entries),
  };
}

function plannedSummary(p: SnapshotExercise): string {
  const parts = [`${p.sets} × ${p.reps ?? "?"}`];
  parts.push(p.loadKg != null ? `${p.loadKg} kg` : "vlastná váha");
  if (p.tempo) parts.push(`tempo ${p.tempo}`);
  if (p.restSeconds != null) parts.push(`pauza ${p.restSeconds} s`);
  return parts.join(" · ");
}

function plannedCell(row: CompareRow): string {
  if (!row.planned) return "navyše";
  const reps = row.planned.reps ? `${row.planned.reps} op.` : "—";
  return row.planned.loadKg != null ? `${reps} × ${row.planned.loadKg} kg` : reps;
}

function actualCell(row: CompareRow): string {
  const a = row.actual;
  if (!a) return "neodcvičené";
  const parts: string[] = [];
  if (a.reps != null) parts.push(`${a.reps} op.`);
  if (a.weight != null) parts.push(`${a.weight} kg`);
  if (a.durationS != null) parts.push(formatDuration(a.durationS));
  if (a.distanceM != null) parts.push(formatDistance(a.distanceM));
  return parts.join(" × ") || "—";
}

const TONE_CLASS = { below: styles.toneBelow, above: styles.toneAbove, met: styles.toneMet } as const;
const TONE_LABEL = { below: "pod plánom", above: "nad plán", met: "podľa plánu" } as const;

export default async function CompletedWorkoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; logId: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { id: clientId, logId } = await params;
  const { preview } = await searchParams;

  let view: CompletedWorkoutView;
  if (preview === "done" && process.env.NODE_ENV === "development") {
    view = previewView(clientId, logId);
  } else {
    const supabase = await createClient();
    // RLS workout_logs_select_own_trainer — tréner vidí len záznamy svojich klientov.
    const [{ data: log }, { data: client }] = await Promise.all([
      supabase
        .from("workout_logs")
        .select("id, client_id, status, completed_at, performed_on, rpe, note, entries, plan_snapshot")
        .eq("id", logId)
        .eq("client_id", clientId)
        .maybeSingle(),
      supabase.from("clients").select("full_name").eq("id", clientId).maybeSingle(),
    ]);
    if (!log || !client) notFound();

    const snapshot = parsePlanSnapshot(log.plan_snapshot);
    view = {
      logId: log.id,
      clientId,
      clientName: client.full_name,
      status: log.status,
      completedAt: log.completed_at,
      performedOn: log.performed_on,
      rpe: log.rpe,
      note: log.note,
      snapshot,
      exercises: comparePlanWithActual(snapshot, parseLoggedEntries(log.entries)),
    };
  }

  const completed = view.status === "completed";
  const dateLabel = formatCompletedDate(view.completedAt ?? `${view.performedOn}T12:00:00Z`);
  const title = view.snapshot?.dayName ?? "Tréning";

  return (
    <>
      <Link href={`/dashboard/klienti/${view.clientId}`} className={dashboardStyles.backLink}>
        <BackIcon />
        Späť na klienta
      </Link>

      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.sub}>
            <Link href={`/dashboard/klienti/${view.clientId}`}>{view.clientName}</Link>
            {view.snapshot?.planName && <> · {view.snapshot.planName}</>}
          </p>
        </div>
        <span className={completed ? styles.doneBadge : styles.progressBadge} data-testid="workout-status">
          {completed ? (
            <>
              <LockIcon /> Dokončený – {dateLabel}
            </>
          ) : (
            "Prebieha"
          )}
        </span>
      </div>

      {completed && (
        <p className={styles.readonlyNote}>
          Toto je záznam toho, čo klient odcvičil — nedá sa upraviť ani zmazať. Ak chceš tréning zopakovať
          alebo zmeniť, vytvor si z neho novú kópiu.
        </p>
      )}

      <div className={styles.actions}>
        <DuplicateWorkoutButton logId={view.logId} disabled={!completed || (view.snapshot?.exercises.length ?? 0) === 0} />
      </div>

      {(view.rpe != null || view.note) && (
        <div className={styles.sessionMeta}>
          {view.rpe != null && (
            <p>
              <span className={styles.metaLabel}>Náročnosť (RPE)</span> {view.rpe}/10
            </p>
          )}
          {view.note && (
            <p>
              <span className={styles.metaLabel}>Poznámka klienta</span> „{view.note}“
            </p>
          )}
        </div>
      )}

      {view.snapshot?.backfilled && (
        <p className={styles.backfillNote}>
          Tréning je starší než ukladanie plánu k záznamu — plán zobrazujeme podľa jeho aktuálnej verzie, nemusí
          presne zodpovedať tomu, čo mal klient v ten deň naplánované.
        </p>
      )}

      {view.exercises.length === 0 ? (
        <p className={dashboardStyles.noWorkouts}>Klient ukončil tréning bez zapísaných hodnôt.</p>
      ) : (
        <div className={styles.exerciseList}>
          {view.exercises.map((ex) => (
            <section key={ex.key} className={styles.exercise} data-testid="completed-exercise">
              <header className={styles.exerciseHead}>
                <h2 className={styles.exerciseName}>{ex.name}</h2>
                {ex.status === "skipped" && <span className={styles.chipMuted}>Nezapísané</span>}
                {ex.status === "extra" && <span className={styles.chipMuted}>Mimo plánu</span>}
              </header>
              {ex.planned && <p className={styles.plannedLine}>Plán: {plannedSummary(ex.planned)}</p>}

              {ex.rows.length > 0 && (
                <div className={styles.setTable} role="table" aria-label={`Série — ${ex.name}`}>
                  <div className={styles.setHeadRow} role="row">
                    <span role="columnheader">Séria</span>
                    <span role="columnheader">Plán</span>
                    <span role="columnheader">Skutočnosť</span>
                  </div>
                  {ex.rows.map((row) => {
                    const tone = rowTone(row);
                    return (
                      <div key={row.index} className={styles.setRow} role="row" data-testid="set-row">
                        <span role="cell" className={styles.setIndex}>
                          {row.index}.
                        </span>
                        <span role="cell" className={styles.planned}>
                          {plannedCell(row)}
                        </span>
                        <span role="cell" className={`${styles.actual} ${tone ? TONE_CLASS[tone] : ""}`}>
                          {actualCell(row)}
                          {row.actual?.rpe != null && <span className={styles.rpe}> · RPE {row.actual.rpe}</span>}
                          {tone && tone !== "met" && <span className={styles.srOnly}> ({TONE_LABEL[tone]})</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {ex.note && <p className={styles.exerciseNote}>„{ex.note}“</p>}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
