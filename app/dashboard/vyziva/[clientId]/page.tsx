import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NutritionForm } from "./NutritionForm";
import { CreateMealPlanForm } from "./CreateMealPlanForm";
import styles from "../../dashboard.module.css";

const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M9 3 4 7l5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default async function NutritionDetailPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/prihlasenie");
  }

  const { data: client } = await supabase
    .from("clients")
    .select("id, full_name")
    .eq("id", clientId)
    .maybeSingle();

  if (!client) {
    notFound();
  }

  const [{ data: profile }, { data: mealPlans }] = await Promise.all([
    supabase
      .from("nutrition_profiles")
      .select("sex, age, weight_kg, height_cm, activity_level, goal, notes, bmr, tdee, calories_target, protein_g, carbs_g, fat_g")
      .eq("client_id", clientId)
      .maybeSingle(),
    supabase
      .from("meal_plans")
      .select("id, name, created_at, meal_days(count)")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <>
      <Link href="/dashboard/vyziva" className={styles.backLink}>
        <BackIcon />
        Späť na výživu
      </Link>

      <div className={styles.detailHead}>
        <div>
          <h1>{client.full_name}</h1>
          <div className={styles.clientGoal}>Makro cieľ a jedálničky</div>
        </div>
      </div>

      <NutritionForm clientId={clientId} profile={profile ?? null} />

      <div className={styles.card} style={{ marginTop: 20 }}>
        <h3>Jedálničky</h3>
        <CreateMealPlanForm clientId={clientId} />
        {mealPlans && mealPlans.length > 0 ? (
          <div className={styles.roster}>
            {mealPlans.map((plan) => {
              const dayCount = (plan.meal_days as unknown as { count: number }[] | null)?.[0]?.count ?? 0;
              return (
                <Link key={plan.id} href={`/dashboard/vyziva/jedalnicek/${plan.id}`} className={styles.clientCard}>
                  <div className={styles.clientName}>{plan.name}</div>
                  <span className={styles.clientSince}>{dayCount} dní</span>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className={styles.noWorkouts}>Klient zatiaľ nemá jedálniček — vytvor prvý vyššie.</p>
        )}
      </div>
    </>
  );
}
