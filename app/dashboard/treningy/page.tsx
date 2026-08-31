import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreatePlanForm } from "./CreatePlanForm";
import { AddCustomExerciseForm } from "./AddCustomExerciseForm";
import styles from "../dashboard.module.css";

export default async function TreningyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Layout guard robí vlastný getUser() call — pri studenom štarte (cookie ešte
  // neoverená) sa môžu rozísť. Radšej redirect než pád na `user!.id`.
  if (!user) {
    redirect("/prihlasenie");
  }

  const [{ data: clients }, { data: exercises }, { data: plans }] = await Promise.all([
    supabase.from("clients").select("id, full_name").eq("trainer_id", user.id).order("full_name"),
    supabase.from("exercises").select("id, name, muscle_group").order("name"),
    supabase
      .from("workout_plans")
      // Explicitná FK — viď poznámku v [planId]/page.tsx (clients.active_plan_id
      // robí plain `clients(...)` embed nejednoznačným, celý zoznam plánov by inak
      // vždy vyzeral prázdny).
      .select("id, name, created_at, clients!workout_plans_client_id_fkey(full_name), workout_days(count)")
      .eq("trainer_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <>
      <div className={styles.pageHead}>
        <h1>Tréningy</h1>
        <p>Zostav plán klientovi — knižnica cvikov, dni, série a opakovania.</p>
      </div>

      <div className={styles.card} style={{ marginBottom: 20 }}>
        <h3>Nový plán</h3>
        <CreatePlanForm clients={clients ?? []} />
      </div>

      {plans && plans.length > 0 ? (
        <div className={styles.roster} style={{ marginBottom: 28 }}>
          {plans.map((plan) => {
            const clientName = (plan.clients as unknown as { full_name: string } | null)?.full_name ?? "?";
            const dayCount = (plan.workout_days as unknown as { count: number }[] | null)?.[0]?.count ?? 0;
            return (
              <Link key={plan.id} href={`/dashboard/treningy/${plan.id}`} className={styles.clientCard}>
                <div>
                  <div className={styles.clientName}>{plan.name}</div>
                  <div className={styles.clientGoal}>{clientName}</div>
                </div>
                <span className={styles.clientSince}>{dayCount} dní</span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className={styles.emptyState} style={{ marginBottom: 28 }}>
          <h2>Zatiaľ žiadne plány</h2>
          <p>Vytvor prvý plán vyššie.</p>
        </div>
      )}

      <div className={styles.card}>
        <h3>Knižnica cvikov ({exercises?.length ?? 0})</h3>
        <AddCustomExerciseForm />
        {exercises && exercises.length > 0 && (
          <div className={styles.tagList} style={{ marginTop: 14 }}>
            {exercises.map((ex) => (
              <span key={ex.id}>
                {ex.name}
                {ex.muscle_group ? ` · ${ex.muscle_group}` : ""}
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
