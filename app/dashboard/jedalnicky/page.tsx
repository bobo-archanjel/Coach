import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { CreateMealPlanForm } from "./CreateMealPlanForm";
import { mealPlanAvgDayKcal } from "@/lib/meals";
import styles from "@/app/dashboard/dashboard.module.css";

/**
 * Jedálničky trénera — rovnaké rozloženie ako Tréningy: hore „Nový jedálniček“ (aj pre
 * viacerých klientov), pod ním všetky jedálničky od najnovšieho. Makro cieľ (vstupné
 * údaje + výsledok) je v detaile klienta, záložka Jedálničky.
 */
export default async function JedalnickyPage() {
  const t = await getTranslations("mealPlans");
  const supabase = await createClient();
  const {
    data: { user },
  } = await getUser();

  // Layout guard robí vlastný getUser() call — pri studenom štarte (cookie ešte
  // neoverená) sa môžu rozísť. Radšej redirect než pád na `user!.id`.
  if (!user) {
    redirect("/prihlasenie");
  }

  const [{ data: clients }, { data: plans }] = await Promise.all([
    supabase.from("clients").select("id, full_name").eq("trainer_id", user.id).order("full_name"),
    supabase
      .from("meal_plans")
      // meal_days(meals) kvôli priemerným kcal na deň (lib/meals.ts)
      .select("id, name, created_at, published, client_id, clients(full_name), meal_days(meals)")
      .eq("trainer_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  // Portál ukazuje klientovi jeho najnovší ZVEREJNENÝ jedálniček (zoradené od najnovšieho).
  const activeByClient = new Map<string, string>();
  for (const p of plans ?? []) {
    if (p.published && !activeByClient.has(p.client_id)) activeByClient.set(p.client_id, p.id);
  }

  return (
    <>
      <div className={styles.pageHead}>
        <h1>{t("title")}</h1>
        <p>{t("subtitle")}</p>
      </div>

      <div className={styles.card} style={{ marginBottom: 20 }}>
        <h3>{t("newMealPlan")}</h3>
        <CreateMealPlanForm clients={clients ?? []} />
      </div>

      {plans && plans.length > 0 ? (
        <div className={styles.roster} style={{ marginBottom: 28 }}>
          {plans.map((plan) => {
            const clientName = (plan.clients as unknown as { full_name: string } | null)?.full_name ?? "?";
            const days = (plan.meal_days as unknown as { meals: unknown }[] | null) ?? [];
            const kcal = mealPlanAvgDayKcal(days);
            return (
              <Link key={plan.id} href={`/dashboard/jedalnicky/jedalnicek/${plan.id}`} className={styles.clientCard}>
                <div>
                  <div className={styles.clientName}>{plan.name}</div>
                  <div className={styles.clientGoal}>
                    {clientName}
                    {kcal != null && t("kcalPerDay", { kcal })}
                  </div>
                </div>
                {/* vpravo pod sebou: Koncept/Aktívny · počet dní (pevná šírka → štítky v línii) */}
                <span className={`${styles.clientMeta} ${styles.planListMeta}`}>
                  {!plan.published ? (
                    <span className={`${styles.publishBadge} ${styles.publishBadgeDraft}`}>{t("draft")}</span>
                  ) : (
                    activeByClient.get(plan.client_id) === plan.id && (
                      <span className={`${styles.publishBadge} ${styles.publishBadgeLive}`}>{t("active")}</span>
                    )
                  )}
                  <span className={styles.clientSince}>{t("days", { count: days.length })}</span>
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className={styles.emptyState} style={{ marginBottom: 28 }}>
          <h2>{t("emptyTitle")}</h2>
          <p>{t("emptyText")}</p>
        </div>
      )}
    </>
  );
}
