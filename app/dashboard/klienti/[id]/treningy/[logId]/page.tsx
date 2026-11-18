import { getLocale, getTranslations } from "next-intl/server";
import { intlLocale } from "@/lib/i18n/locales";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  comparePlanWithActual,
  formatCompletedDate,
  parseLoggedEntries,
  parsePlanSnapshot,
  type CompareExercise,
  type PlanSnapshot,
} from "@/lib/workouts/completed";
import { CompletedExercises } from "@/app/components/CompletedExercises";
import { DuplicateWorkoutButton } from "./DuplicateWorkoutButton";
import { InfoTip } from "@/app/components/InfoTip";
import dashboardStyles from "@/app/dashboard/dashboard.module.css";
import styles from "./completed.module.css";

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
  /** klient hodnoty dodatočne opravil (24 h okno, 0049) */
  editedAt: string | null;
  performedOn: string;
  rpe: number | null;
  note: string | null;
  snapshot: PlanSnapshot | null;
  exercises: CompareExercise[];
}

// i18n-ignore-start — DEV náhľad (vymyslené dáta)
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
    editedAt: "2026-09-24T20:05:00Z",
    performedOn: "2026-09-24",
    rpe: 8,
    note: "Dobrý tréning, len chrbát trochu tlačil.",
    snapshot,
    exercises: comparePlanWithActual(snapshot, entries),
  };
}
// i18n-ignore-end

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
        .select("id, client_id, status, completed_at, edited_at, performed_on, rpe, note, entries, plan_snapshot")
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
      editedAt: log.edited_at,
      performedOn: log.performed_on,
      rpe: log.rpe,
      note: log.note,
      snapshot,
      exercises: comparePlanWithActual(snapshot, parseLoggedEntries(log.entries)),
    };
  }

  const [t, locale] = await Promise.all([getTranslations("clientDetail.log"), getLocale()]);
  const completed = view.status === "completed";
  const dateLabel = formatCompletedDate(view.completedAt ?? `${view.performedOn}T12:00:00Z`, locale);
  const title = view.snapshot?.dayName ?? t("workoutFallback");

  return (
    <>
      <Link href={`/dashboard/klienti/${view.clientId}`} className={dashboardStyles.backLink}>
        <BackIcon />
        {t("back")}
      </Link>

      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.sub}>
            <Link href={`/dashboard/klienti/${view.clientId}`}>{view.clientName}</Link>
            {view.snapshot?.planName && <> · {view.snapshot.planName}</>}
          </p>
        </div>
        <span className={styles.headStatus}>
          <span className={completed ? styles.doneBadge : styles.progressBadge} data-testid="workout-status">
            {completed ? (
              <>
                <LockIcon /> {t("completed", { date: dateLabel })}
              </>
            ) : (
              t("inProgress")
            )}
          </span>
          {completed && (
            <InfoTip title={t("recordTitle")}>{t("recordTip")}</InfoTip>
          )}
        </span>
      </div>

      {view.editedAt && (
        <p className={styles.editedNote} data-testid="workout-edited">
          {t("edited", {
            date: formatCompletedDate(view.editedAt, locale),
            time: new Intl.DateTimeFormat(intlLocale(locale), {
              timeZone: "Europe/Bratislava",
              hour: "numeric",
              minute: "2-digit",
            }).format(new Date(view.editedAt)),
          })}
        </p>
      )}

      <div className={styles.actions}>
        <DuplicateWorkoutButton logId={view.logId} disabled={!completed || (view.snapshot?.exercises.length ?? 0) === 0} />
      </div>

      {(view.rpe != null || view.note) && (
        <div className={styles.sessionMeta}>
          {view.rpe != null && (
            <p>
              <span className={styles.metaLabel}>{t("rpe")}</span> {view.rpe}/10
            </p>
          )}
          {view.note && (
            <p>
              <span className={styles.metaLabel}>{t("clientNote")}</span> „{view.note}“
            </p>
          )}
        </div>
      )}

      {view.snapshot?.backfilled && (
        <p className={styles.backfillNote}>
          {t("backfilled")}
        </p>
      )}

      {view.exercises.length === 0 ? (
        <p className={dashboardStyles.noWorkouts}>{t("noValues")}</p>
      ) : (
        <CompletedExercises exercises={view.exercises} hasPlan={view.snapshot !== null} headingLevel={2} />
      )}
    </>
  );
}
