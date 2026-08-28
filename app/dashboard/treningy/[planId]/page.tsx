import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlanBuilder } from "./PlanBuilder";
import styles from "../../dashboard.module.css";

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
    supabase.from("workout_days").select("id, day_number, name, weekday, exercises").eq("plan_id", planId).order("day_number"),
    supabase.from("exercises").select("id, name, muscle_group").order("name"),
  ]);

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

      <PlanBuilder planId={planId} days={days ?? []} library={exercises ?? []} />
    </>
  );
}
