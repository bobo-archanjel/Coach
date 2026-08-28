import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import styles from "../../dashboard.module.css";

const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M9 3 4 7l5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client } = await supabase
    .from("clients")
    .select("id, full_name, goal, notes, invite_code, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!client) {
    notFound();
  }

  const [{ data: plans }, { data: nutrition }] = await Promise.all([
    supabase
      .from("workout_plans")
      .select("id, name, created_at, workout_days(count)")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("nutrition_profiles")
      .select("calories_target, protein_g, carbs_g, fat_g")
      .eq("client_id", id)
      .maybeSingle(),
  ]);

  const memberSince = new Date(client.created_at).toLocaleDateString("sk-SK", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <Link href="/dashboard" className={styles.backLink}>
        <BackIcon />
        Späť na klientov
      </Link>

      <div className={styles.detailHead}>
        <div>
          <h1>{client.full_name}</h1>
          {client.goal && <div className={styles.clientGoal}>{client.goal}</div>}
        </div>
      </div>

      <div className={styles.detailGrid}>
        <div className={styles.card}>
          <h3>Informácie</h3>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Klient od</span>
            <span className={styles.infoValue}>{memberSince}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Pozývací kód</span>
            <span className={styles.infoValue}>{client.invite_code}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Poznámky</span>
            {client.notes ? (
              <span className={styles.infoValue}>{client.notes}</span>
            ) : (
              <span className={styles.notesEmpty}>Žiadne poznámky</span>
            )}
          </div>
        </div>

        <div className={styles.cardStack}>
          <div className={styles.card}>
            <h3>Tréningové plány</h3>
            {plans && plans.length > 0 ? (
              <div className={styles.roster}>
                {plans.map((plan) => {
                  const dayCount = (plan.workout_days as unknown as { count: number }[] | null)?.[0]?.count ?? 0;
                  return (
                    <Link key={plan.id} href={`/dashboard/treningy/${plan.id}`} className={styles.clientCard}>
                      <div className={styles.clientName}>{plan.name}</div>
                      <span className={styles.clientSince}>{dayCount} dní</span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className={styles.noWorkouts}>
                Klient zatiaľ nemá vytvorený tréningový plán — pridaj ho na{" "}
                <Link href="/dashboard/treningy">Tréningy</Link>.
              </p>
            )}
          </div>

          <div className={styles.card}>
            <h3>Makro cieľ</h3>
            {nutrition ? (
              <>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Kalorický cieľ</span>
                  <span className={styles.infoValue}>{nutrition.calories_target} kcal/deň</span>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Makrá</span>
                  <span className={styles.infoValue}>
                    {nutrition.protein_g} g B · {nutrition.carbs_g} g S · {nutrition.fat_g} g T
                  </span>
                </div>
                <Link href={`/dashboard/vyziva/${id}`} className={styles.backLink} style={{ marginTop: 8, marginBottom: 0 }}>
                  Upraviť →
                </Link>
              </>
            ) : (
              <p className={styles.noWorkouts}>
                Makro cieľ zatiaľ nenastavený — <Link href={`/dashboard/vyziva/${id}`}>vypočítať teraz</Link>.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
