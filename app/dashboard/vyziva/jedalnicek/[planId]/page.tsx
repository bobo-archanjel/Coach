import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { MealPlanBuilder } from "./MealPlanBuilder";
import { MealPlanControls } from "./MealPlanControls";
import { SaveTemplateForm } from "../../../sablony/SaveTemplateForm";
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

  // `plan`, `days` aj `foods` berú `planId`/nič z route parametra — nezávislé,
  // paralelne namiesto čakania na `plan` pred spustením zvyšných dvoch.
  const [{ data: plan }, { data: days }, { data: foods }] = await Promise.all([
    supabase
      .from("meal_plans")
      .select("id, name, client_id, published, created_at, clients(full_name)")
      .eq("id", planId)
      .maybeSingle(),
    supabase.from("meal_days").select("id, day_number, name, meals").eq("plan_id", planId).order("day_number"),
    supabase.from("foods").select("id, name, kcal_100g, protein_100g, carbs_100g, fat_100g").order("name"),
  ]);

  if (!plan) {
    notFound();
  }

  const clientName = (plan.clients as unknown as { full_name: string } | null)?.full_name ?? "?";

  // Portál ukazuje najnovší zverejnený jedálniček — je to tento?
  let visibleToClient = false;
  if (plan.published) {
    const { data: newerPublished } = await supabase
      .from("meal_plans")
      .select("id")
      .eq("client_id", plan.client_id)
      .eq("published", true)
      .gt("created_at", plan.created_at)
      .limit(1);
    visibleToClient = (newerPublished ?? []).length === 0;
  }

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
        <MealPlanControls
          planId={planId}
          name={plan.name}
          published={plan.published}
          visibleToClient={visibleToClient}
        />
      </div>

      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <SaveTemplateForm kind="meal" planId={planId} defaultName={plan.name} />
        <a href={`/api/export/meal-plan/${planId}/pdf`} className="btn btn-ghost btn-sm">
          Stiahnuť PDF
        </a>
      </div>

      <MealPlanBuilder planId={planId} days={days ?? []} library={foods ?? []} />
    </>
  );
}
