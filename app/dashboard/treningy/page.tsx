import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { CreatePlanForm } from "./CreatePlanForm";
import { AiPlanGeneratorForm } from "./AiPlanGeneratorForm";
import styles from "@/app/dashboard/dashboard.module.css";

export default async function TreningyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await getUser();

  // Layout guard robí vlastný getUser() call — pri studenom štarte (cookie ešte
  // neoverená) sa môžu rozísť. Radšej redirect než pád na `user!.id`.
  if (!user) {
    redirect("/prihlasenie");
  }

  // Len vytvorenie plánu (ručne alebo AI). Plány klienta sú v jeho detaile (Tréningy),
  // knižnica cvikov priamo v builderi plánu — zoznamy tu boli duplicita.
  // `nutrition_profiles(sex)` — jediná FK z profilu späť na clients je client_id,
  // takže embed je jednoznačný (na rozdiel od clients↔workout_plans). Sex sa
  // vypĺňa len pri výpočte makier, takže pri mnohých klientoch bude null.
  const { data: clients } = await supabase
    .from("clients")
    .select("id, full_name, nutrition_profiles(sex)")
    .eq("trainer_id", user.id)
    .order("full_name");

  const clientList = (clients ?? []).map((c) => {
    const profile = c.nutrition_profiles as unknown as { sex: "muz" | "zena" } | { sex: "muz" | "zena" }[] | null;
    const sex = (Array.isArray(profile) ? profile[0]?.sex : profile?.sex) ?? null;
    return { id: c.id, full_name: c.full_name, sex };
  });

  const t = await getTranslations("plans");
  return (
    <>
      <div className={styles.pageHead}>
        <h1>{t("title")}</h1>
        <p>{t("subtitle")}</p>
      </div>

      <div className={styles.card} style={{ marginBottom: 20 }} data-tour="plans-new">
        <h3>{t("newPlan")}</h3>
        <CreatePlanForm clients={clientList} />
      </div>

      <div className={styles.card} data-tour="plans-ai">
        <h3>{t("aiGenerator")}</h3>
        <AiPlanGeneratorForm clients={clientList} />
      </div>

    </>
  );
}
