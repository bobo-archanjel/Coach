import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AddClientForm } from "./AddClientForm";
import styles from "./dashboard.module.css";

export default async function ClientsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, full_name, goal, created_at")
    .eq("trainer_id", user!.id)
    .order("created_at", { ascending: false });

  return (
    <>
      <div className={styles.pageHead}>
        <h1>Klienti</h1>
        <p>{clients?.length ?? 0} klientov v starostlivosti — kliknutím otvoríš detail.</p>
      </div>

      <AddClientForm />

      {clients && clients.length > 0 ? (
        <div className={styles.roster}>
          {clients.map((client) => (
            <Link key={client.id} href={`/dashboard/klienti/${client.id}`} className={styles.clientCard}>
              <div>
                <div className={styles.clientName}>{client.full_name}</div>
                {client.goal && <div className={styles.clientGoal}>{client.goal}</div>}
              </div>
              <span className={styles.clientSince}>
                od {new Date(client.created_at).toLocaleDateString("sk-SK")}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <h2>Zatiaľ nemáš žiadnych klientov</h2>
          <p>Pridaj prvého klienta vyššie.</p>
        </div>
      )}
    </>
  );
}
