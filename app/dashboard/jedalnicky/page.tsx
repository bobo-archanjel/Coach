import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { loadMacroTargets } from "@/lib/macroTarget";
import { CreateMealPlanForm } from "./CreateMealPlanForm";
import { FeatureGate } from "../LockedFeature";
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

  const { data: clients } = await supabase.from("clients").select("id, full_name").eq("trainer_id", user.id).order("full_name");
  // efektívny makro cieľ klientov (vlastný, ak je aktívny, inak trénerov) — AI generátor ho potrebuje
  const targets = await loadMacroTargets(supabase, (clients ?? []).map((c) => c.id as string));
  const targetByClient = new Map(
    [...targets].map(([id, pr]) => [
      id,
      { kcal: Math.round(pr.caloriesTarget), protein: Math.round(pr.proteinG), carbs: Math.round(pr.carbsG), fat: Math.round(pr.fatG) },
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
        <FeatureGate feature="aiMealGenerator">
          <AiMealGeneratorForm clients={aiClients} />
        </FeatureGate>
      </div>
    </>
  );
}
