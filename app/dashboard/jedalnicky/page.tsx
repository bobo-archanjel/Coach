import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { CreateMealPlanForm } from "./CreateMealPlanForm";
import { AiMealGeneratorForm } from "./AiMealGeneratorForm";
import { mealPlanAvgDayKcal } from "@/lib/meals";
import styles from "@/app/dashboard/dashboard.module.css";

// AI generátor jedálnička (server action aiActions.ts) hľadá potraviny v modeli a čaká na odpoveď — dlhšie než bežná akcia
export const maxDuration = 120;

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

  const [{ data: clients }, { data: plans }, { data: profiles }] = await Promise.all([
    supabase.from("clients").select("id, full_name").eq("trainer_id", user.id).order("full_name"),
    supabase
      .from("meal_plans")
      // meal_days(meals) kvôli priemerným kcal na deň (lib/meals.ts)
      .select("id, name, created_at, published, client_id, clients!meal_plans_client_id_fkey(full_name), meal_days(meals)")
      .eq("trainer_id", user.id)
      .order("created_at", { ascending: false }),
    // makro cieľ klientov — AI generátor ho potrebuje (RLS: len klienti tohto trénera)
    supabase.from("nutrition_profiles").select("client_id, calories_target, protein_g, carbs_g, fat_g").eq("trainer_id", user.id),
  ]);

  const targetByClient = new Map(
    (profiles ?? []).map((pr) => [
      pr.client_id as string,
      { kcal: Math.round(Number(pr.calories_target)), protein: Math.round(Number(pr.protein_g)), carbs: Math.round(Number(pr.carbs_g)), fat: Math.round(Number(pr.fat_g)) },
    ]),
  );
  const aiClients = (clients ?? []).map((c) => {
    const target = targetByClient.get(c.id);
    return { id: c.id, full_name: c.full_name, target: target && target.kcal > 0 ? target : null };
  });

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

      <div className={styles.card} style={{ marginBottom: 20 }} data-tour="mealplans-new">
        <h3>{t("newMealPlan")}</h3>
        <CreateMealPlanForm clients={clients ?? []} />
      </div>

      <div className={styles.card} style={{ marginBottom: 20 }} data-tour="mealplans-ai">
        <h3>{t("ai.title")}</h3>
        <AiMealGeneratorForm clients={aiClients} />
      </div>

      {plans && plans.length > 0 ? (
        <div className={styles.roster} style={{ marginBottom: 28 }} data-tour="mealplans-list">
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
