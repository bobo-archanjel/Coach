import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TemplateRow } from "./TemplateRow";
import { PLAN_GOALS, PLAN_GOAL_LABEL_SK, isPlanGoal } from "@/lib/planGoals";
import styles from "../dashboard.module.css";

export default async function SablonyPage({ searchParams }: { searchParams: Promise<{ goal?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/prihlasenie");

  const { goal: goalParam } = await searchParams;
  const activeGoal = isPlanGoal(goalParam) ? goalParam : null;

  const [{ data: clients }, { data: planTemplates }, { data: mealTemplates }] = await Promise.all([
    supabase.from("clients").select("id, full_name").eq("trainer_id", user.id).order("full_name"),
    supabase
      .from("plan_templates")
      .select("id, name, goal, created_at, plan_template_days(count)")
      .eq("trainer_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("meal_templates")
      .select("id, name, created_at, meal_template_days(count)")
      .eq("trainer_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const clientList = clients ?? [];
  // Filter podľa cieľa je len na tréningových šablónach — jedálničkové goal nemajú
  // (0025_templates.sql: `goal` stĺpec existuje iba na plan_templates).
  const filteredPlanTemplates = activeGoal ? (planTemplates ?? []).filter((t) => t.goal === activeGoal) : planTemplates ?? [];

  return (
    <>
      <div className={styles.pageHead}>
        <h1>Šablóny</h1>
        <p>
          Ulož si tréningový plán alebo jedálniček ako šablónu na detaile plánu (&bdquo;Uložiť ako šablónu&ldquo;) a znovu ju použi pre
          ďalšieho klienta — vytvorí sa bežný koncept na doladenie, nič sa neposiela klientovi automaticky.
        </p>
      </div>

      <div className={styles.cardStack}>
        <div className={styles.card}>
          <h3>Tréningové šablóny</h3>

          {planTemplates && planTemplates.length > 0 && (
            <div className={styles.templateFilterRow}>
              <Link href="/dashboard/sablony" className={`${styles.templateFilterPill} ${!activeGoal ? styles.templateFilterPillActive : ""}`}>
                Všetky
              </Link>
              {PLAN_GOALS.map((g) => (
                <Link
                  key={g}
                  href={`/dashboard/sablony?goal=${g}`}
                  className={`${styles.templateFilterPill} ${activeGoal === g ? styles.templateFilterPillActive : ""}`}
                >
                  {PLAN_GOAL_LABEL_SK[g]}
                </Link>
              ))}
            </div>
          )}

          {filteredPlanTemplates.length > 0 ? (
            <div className={styles.templateRoster}>
              {filteredPlanTemplates.map((t) => {
                const dayCount = (t.plan_template_days as unknown as { count: number }[] | null)?.[0]?.count ?? 0;
                return (
                  <TemplateRow
                    key={t.id}
                    kind="workout"
                    templateId={t.id}
                    name={t.name}
                    dayCount={dayCount}
                    goal={t.goal}
                    clients={clientList}
                  />
                );
              })}
            </div>
          ) : planTemplates && planTemplates.length > 0 ? (
            <p className={styles.noWorkouts}>Žiadna šablóna s týmto cieľom.</p>
          ) : (
            <p className={styles.noWorkouts}>
              Zatiaľ žiadne tréningové šablóny — otvor plán na <Link href="/dashboard/treningy">Tréningy</Link> a ulož ho ako šablónu.
            </p>
          )}
        </div>

        <div className={styles.card}>
          <h3>Jedálničkové šablóny</h3>
          {mealTemplates && mealTemplates.length > 0 ? (
            <div className={styles.templateRoster}>
              {mealTemplates.map((t) => {
                const dayCount = (t.meal_template_days as unknown as { count: number }[] | null)?.[0]?.count ?? 0;
                return <TemplateRow key={t.id} kind="meal" templateId={t.id} name={t.name} dayCount={dayCount} goal={null} clients={clientList} />;
              })}
            </div>
          ) : (
            <p className={styles.noWorkouts}>
              Zatiaľ žiadne jedálničkové šablóny — otvor jedálniček na <Link href="/dashboard/vyziva">Výžive</Link> a ulož ho ako šablónu.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
