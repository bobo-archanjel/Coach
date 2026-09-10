import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { getPlanCompletion } from "@/lib/dashboard/planCompletion";
import { CreatePlanForm } from "./CreatePlanForm";
import { AiPlanGeneratorForm } from "./AiPlanGeneratorForm";
import { AddCustomExerciseForm } from "./AddCustomExerciseForm";
import { ExerciseLibraryList } from "./ExerciseLibraryList";
import styles from "../dashboard.module.css";

export default async function TreningyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await getUser();

  // Layout guard robí vlastný getUser() call — pri studenom štarte (cookie ešte
  // neoverená) sa môžu rozísť. Radšej redirect než pád na `user!.id`.
  if (!user) {
    redirect("/prihlasenie");
  }

  const [{ data: clients }, { count: exerciseCount }, { data: plans }] = await Promise.all([
    // `nutrition_profiles(sex)` — jediná FK z profilu späť na clients je client_id,
    // takže embed je jednoznačný (na rozdiel od clients↔workout_plans). Sex sa
    // vypĺňa len pri výpočte makier, takže pri mnohých klientoch bude null.
    supabase
      .from("clients")
      .select("id, full_name, nutrition_profiles(sex)")
      .eq("trainer_id", user.id)
      .order("full_name"),
    // Len počet pre hlavičku — celé riadky (~900, aj muscle_group) sa ťahajú až na
    // požiadanie v ExerciseLibraryList (defaultne zbalené), nie pri každom načítaní.
    supabase.from("exercises").select("id", { count: "exact", head: true }),
    supabase
      .from("workout_plans")
      // Explicitná FK — viď poznámku v [planId]/page.tsx (clients.active_plan_id
      // robí plain `clients(...)` embed nejednoznačným, celý zoznam plánov by inak
      // vždy vyzeral prázdny). `workout_days(id)` (nie `(count)`) — z tých istých
      // ID sa počíta aj počet dní aj odcvičenosť (getPlanCompletion) bez ďalšieho
      // dopytu na `workout_days`.
      .select("id, name, created_at, published, clients!workout_plans_client_id_fkey(full_name), workout_days(id)")
      .eq("trainer_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  // Odcvičenosť plánov — jeden zdroj pravdy zdieľaný s detailom klienta
  // (lib/dashboard/planCompletion.ts). Jediný dopyt navyše, po `plans`, lebo
  // potrebuje ich ID dní.
  const planCompletion = await getPlanCompletion(
    supabase,
    (plans ?? []).map((p) => ({
      id: p.id,
      dayIds: ((p.workout_days as unknown as { id: string }[] | null) ?? []).map((d) => d.id),
    })),
  );

  const clientList = (clients ?? []).map((c) => {
    const profile = c.nutrition_profiles as unknown as { sex: "muz" | "zena" } | { sex: "muz" | "zena" }[] | null;
    const sex = (Array.isArray(profile) ? profile[0]?.sex : profile?.sex) ?? null;
    return { id: c.id, full_name: c.full_name, sex };
  });

  return (
    <>
      <div className={styles.pageHead}>
        <h1>Tréningy</h1>
        <p>Zostav plán klientovi — knižnica cvikov, dni, série a opakovania.</p>
      </div>

      <div className={styles.card} style={{ marginBottom: 20 }}>
        <h3>Nový plán</h3>
        <CreatePlanForm clients={clientList} />
      </div>

      <div className={styles.card} style={{ marginBottom: 20 }}>
        <h3>AI generátor plánu</h3>
        <AiPlanGeneratorForm clients={clientList} />
      </div>

      {plans && plans.length > 0 ? (
        <div className={styles.roster} style={{ marginBottom: 28 }}>
          {plans.map((plan) => {
            const clientName = (plan.clients as unknown as { full_name: string } | null)?.full_name ?? "?";
            const dayCount = (plan.workout_days as unknown as { id: string }[] | null)?.length ?? 0;
            const done = planCompletion.get(plan.id);
            return (
              <Link key={plan.id} href={`/dashboard/treningy/${plan.id}`} className={styles.clientCard}>
                <div>
                  <div className={styles.clientName}>
                    {plan.name}
                    {!plan.published && <span className={`${styles.publishBadge} ${styles.publishBadgeDraft}`} style={{ marginLeft: 8 }}>Koncept</span>}
                  </div>
                  <div className={styles.clientGoal}>{clientName}</div>
                </div>
                {done?.allDone ? (
                  <span className={styles.planDoneBadge}>Hotovo</span>
                ) : (
                  <span className={styles.clientSince}>
                    {done && done.completedDays > 0 ? `${done.completedDays}/${dayCount}` : dayCount} dní
                  </span>
                )}
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
        <h3>Knižnica cvikov ({exerciseCount ?? 0})</h3>
        <AddCustomExerciseForm />
        {(exerciseCount ?? 0) > 0 && <ExerciseLibraryList count={exerciseCount ?? 0} />}
      </div>
    </>
  );
}
