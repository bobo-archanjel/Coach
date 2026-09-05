import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import styles from "../dashboard.module.css";

interface NutritionSummary {
  calories_target: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export default async function VyzivaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await getUser();

  // Layout guard robí vlastný getUser() call — pri studenom štarte (cookie ešte
  // neoverená) sa môžu rozísť. Radšej redirect než pád na `user!.id`.
  if (!user) {
    redirect("/prihlasenie");
  }

  const { data: clients } = await supabase
    .from("clients")
    .select("id, full_name, nutrition_profiles(calories_target, protein_g, carbs_g, fat_g)")
    .eq("trainer_id", user.id)
    .order("full_name");

  return (
    <>
      <div className={styles.pageHead}>
        <h1>Výživa</h1>
        <p>BMR/TDEE výpočet a makro cieľ pre každého klienta.</p>
      </div>

      {clients && clients.length > 0 ? (
        <div className={styles.roster}>
          {clients.map((client) => {
            const profile = (client.nutrition_profiles as unknown as NutritionSummary[] | null)?.[0] ?? null;
            return (
              <Link key={client.id} href={`/dashboard/vyziva/${client.id}`} className={styles.clientCard}>
                <div>
                  <div className={styles.clientName}>{client.full_name}</div>
                  <div className={styles.clientGoal}>
                    {profile
                      ? `${profile.protein_g} B · ${profile.carbs_g} S · ${profile.fat_g} T (g)`
                      : "Makro cieľ zatiaľ nenastavený"}
                  </div>
                </div>
                <span className={styles.clientSince}>{profile ? `${profile.calories_target} kcal` : "—"}</span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <h2>Zatiaľ žiadni klienti</h2>
          <p>Pridaj klienta na stránke Klienti a potom mu tu nastav makro cieľ.</p>
        </div>
      )}
    </>
  );
}
