import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { CreateMealPlanForm } from "./CreateMealPlanForm";
import { AiMealGeneratorForm } from "./AiMealGeneratorForm";
import styles from "@/app/dashboard/dashboard.module.css";

// AI generátor jedálnička (server action aiActions.ts) hľadá potraviny v modeli a čaká na odpoveď — dlhšie než bežná akcia
export const maxDuration = 120;

/**
 * Jedálničky trénera — rovnaké rozloženie ako Tréningy: „Nový jedálniček“ (aj pre viacerých
 * klientov) a AI generátor. Zoznam jedálničkov tu nie je — jedálničky klienta sú v jeho
 * detaile (záložka Jedálničky), spolu s makro cieľom.
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

  const [{ data: clients }, { data: profiles }] = await Promise.all([
    supabase.from("clients").select("id, full_name").eq("trainer_id", user.id).order("full_name"),
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

      <div className={styles.card} data-tour="mealplans-ai">
        <h3>{t("ai.title")}</h3>
        <AiMealGeneratorForm clients={aiClients} />
      </div>
    </>
  );
}
