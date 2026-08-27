import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AddDayForm } from "./AddDayForm";
import { AddExerciseForm } from "./AddExerciseForm";
import styles from "../../dashboard.module.css";

interface WorkoutExercise {
  exercise_id: string;
  exercise_name: string;
  sets: number;
  reps: string;
  load_kg: number | null;
  tempo: string | null;
  rest_seconds: number | null;
}

const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M9 3 4 7l5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default async function PlanDetailPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const supabase = await createClient();

  const { data: plan } = await supabase
    .from("workout_plans")
    .select("id, name, client_id, clients(full_name)")
    .eq("id", planId)
    .maybeSingle();

  if (!plan) {
    notFound();
  }

  const clientName = (plan.clients as unknown as { full_name: string } | null)?.full_name ?? "?";

  const [{ data: days }, { data: exercises }] = await Promise.all([
    supabase.from("workout_days").select("id, day_number, name, exercises").eq("plan_id", planId).order("day_number"),
    supabase.from("exercises").select("id, name").order("name"),
  ]);

  const nextDayNumber = (days?.length ?? 0) + 1;

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
      </div>

      <div className={styles.workoutList} style={{ marginBottom: 24 }}>
        {days && days.length > 0 ? (
          days.map((day) => {
            const dayExercises = (day.exercises as unknown as WorkoutExercise[]) ?? [];
            return (
              <div key={day.id} className={styles.card}>
                <h3>{day.name}</h3>
                {dayExercises.length > 0 ? (
                  <div className={styles.workoutBlock} style={{ marginBottom: 14 }}>
                    {dayExercises.map((ex, i) => (
                      <div key={i} className={styles.exerciseRow}>
                        <span className={styles.exIdx}>{i + 1}</span>
                        <span className={styles.exName}>{ex.exercise_name}</span>
                        <span className={styles.exLoad}>
                          {ex.sets}× {ex.reps}
                          {ex.load_kg ? ` @ ${ex.load_kg} kg` : ""}
                        </span>
                        <span className={styles.exRest}>
                          {ex.tempo ? `tempo ${ex.tempo}` : ""}
                          {ex.tempo && ex.rest_seconds ? " · " : ""}
                          {ex.rest_seconds ? `pauza ${ex.rest_seconds}s` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.noWorkouts} style={{ marginBottom: 14 }}>
                    Žiadne cviky v tomto dni zatiaľ.
                  </p>
                )}
                <AddExerciseForm dayId={day.id} planId={planId} exercises={exercises ?? []} />
              </div>
            );
          })
        ) : (
          <div className={styles.emptyState}>
            <h2>Zatiaľ žiadne dni</h2>
            <p>Pridaj prvý deň nižšie.</p>
          </div>
        )}
      </div>

      <div className={styles.card}>
        <h3>Pridať deň</h3>
        <AddDayForm planId={planId} nextDayNumber={nextDayNumber} />
      </div>
    </>
  );
}
