import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { MealPlanBuilder } from "./MealPlanBuilder";
import styles from "../../../dashboard.module.css";

const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M9 3 4 7l5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default async function MealPlanDetailPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await getUser();

  if (!user) {
    redirect("/prihlasenie");
  }

  const { data: plan } = await supabase
    .from("meal_plans")
    .select("id, name, client_id, clients(full_name)")
    .eq("id", planId)
    .maybeSingle();

  if (!plan) {
    notFound();
  }

  const clientName = (plan.clients as unknown as { full_name: string } | null)?.full_name ?? "?";

  const [{ data: days }, { data: foods }] = await Promise.all([
    supabase.from("meal_days").select("id, day_number, name, meals").eq("plan_id", planId).order("day_number"),
    supabase.from("foods").select("id, name, kcal_100g, protein_100g, carbs_100g, fat_100g").order("name"),
  ]);

  return (
    <>
      <Link href={`/dashboard/vyziva/${plan.client_id}`} className={styles.backLink}>
        <BackIcon />
        Späť na výživu
      </Link>

      <div className={styles.detailHead}>
        <div>
          <h1>{plan.name}</h1>
          <div className={styles.clientGoal}>
            <Link href={`/dashboard/klienti/${plan.client_id}`}>{clientName}</Link>
          </div>
        </div>
      </div>

      <MealPlanBuilder planId={planId} days={days ?? []} library={foods ?? []} />
    </>
  );
}
