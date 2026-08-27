import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoMark } from "../components/LogoMark";
import { SignOutButton } from "./SignOutButton";
import styles from "./dashboard.module.css";

/**
 * Prvá skutočná chránená obrazovka trénera — zoznam vlastných klientov z DB (RLS: trainer_id = auth.uid()).
 * Pridávanie klientov / invite flow ešte nie je postavené (viď DESIGN.md "Open decisions") —
 * preto zámerne žiadne tlačidlo "Pridať klienta", ktoré by nič nerobilo.
 */
export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/prihlasenie");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, full_name, goal, created_at")
    .eq("trainer_id", user.id)
    .order("created_at", { ascending: false });

  const displayName = profile?.full_name ?? profile?.email ?? user.email;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={`${styles.wrap} ${styles.nav}`}>
          <div className={styles.brand}>
            <LogoMark className={styles.logoMark} />
            FitPilot
          </div>
          <SignOutButton />
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.wrap}>
          <div className={styles.head}>
            <div>
              <h1>Vitaj, {displayName}.</h1>
              <p>Tvoji klienti — zatiaľ len zoznam, tréningový builder a makrá prídu v ďalšej fáze.</p>
            </div>
          </div>

          {clients && clients.length > 0 ? (
            <div className={styles.roster}>
              {clients.map((client) => (
                <div key={client.id} className={styles.clientRow}>
                  <div>
                    <div className={styles.clientName}>{client.full_name}</div>
                    {client.goal && <div className={styles.clientGoal}>{client.goal}</div>}
                  </div>
                  <span className={styles.clientSince}>
                    od {new Date(client.created_at).toLocaleDateString("sk-SK")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <h2>Zatiaľ nemáš žiadnych klientov</h2>
              <p>
                Pridávanie klientov a pozývacie kódy sú ďalšia úloha na roadmape — táto obrazovka
                zatiaľ len potvrdzuje, že prihlásenie a databázové pripojenie fungujú end-to-end.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
