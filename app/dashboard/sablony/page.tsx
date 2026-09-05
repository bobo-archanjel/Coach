import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TemplateRow } from "./TemplateRow";
import styles from "../dashboard.module.css";

export default async function SablonyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/prihlasenie");

  const [{ data: clients }, { data: planTemplates }, { data: mealTemplates }] = await Promise.all([
    supabase.from("clients").select("id, full_name").eq("trainer_id", user.id).order("full_name"),
    supabase
      .from("plan_templates")
      .select("id, name, created_at, plan_template_days(count)")
      .eq("trainer_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("meal_templates")
      .select("id, name, created_at, meal_template_days(count)")
      .eq("trainer_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const clientList = clients ?? [];

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
          {planTemplates && planTemplates.length > 0 ? (
            <div className={styles.templateRoster}>
              {planTemplates.map((t) => {
                const dayCount = (t.plan_template_days as unknown as { count: number }[] | null)?.[0]?.count ?? 0;
                return <TemplateRow key={t.id} kind="workout" templateId={t.id} name={t.name} dayCount={dayCount} clients={clientList} />;
              })}
            </div>
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
                return <TemplateRow key={t.id} kind="meal" templateId={t.id} name={t.name} dayCount={dayCount} clients={clientList} />;
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
