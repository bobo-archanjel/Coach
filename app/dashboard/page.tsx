import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AddClientForm } from "./AddClientForm";
import styles from "./dashboard.module.css";

export default async function ClientsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Layout guard robí vlastný getUser() call — pri studenom štarte (cookie ešte
  // neoverená) sa môžu rozísť. Radšej redirect než pád na `user!.id`.
  if (!user) {
    redirect("/prihlasenie");
  }

  const { data: clients } = await supabase
    .from("clients")
    .select("id, full_name, goal, created_at")
    .eq("trainer_id", user.id)
    .order("created_at", { ascending: false });

  // neprečítané správy od klientov → odznak pri klientovi (RLS scopuje na klientov trénera)
  const { data: unreadRows } = await supabase
    .from("messages")
    .select("client_id")
    .eq("sender", "client")
    .is("read_at", null);
  const unread = new Map<string, number>();
  for (const r of unreadRows ?? []) unread.set(r.client_id, (unread.get(r.client_id) ?? 0) + 1);

  return (
    <>
      <div className={styles.pageHead}>
        <h1>Klienti</h1>
        <p>{clients?.length ?? 0} klientov v starostlivosti — kliknutím otvoríš detail.</p>
      </div>

      <AddClientForm />

      {clients && clients.length > 0 ? (
        <div className={styles.roster}>
          {clients.map((client) => {
            const n = unread.get(client.id) ?? 0;
            return (
              <Link key={client.id} href={`/dashboard/klienti/${client.id}`} className={styles.clientCard}>
                <div>
                  <div className={styles.clientName}>{client.full_name}</div>
                  {client.goal && <div className={styles.clientGoal}>{client.goal}</div>}
                </div>
                <span className={styles.clientMeta}>
                  {n > 0 && (
                    <span className={styles.unreadPill} title={`${n} neprečítaných správ`}>
                      {n} {n === 1 ? "správa" : n >= 2 && n <= 4 ? "správy" : "správ"}
                    </span>
                  )}
                  <span className={styles.clientSince}>
                    od {new Date(client.created_at).toLocaleDateString("sk-SK")}
                  </span>
                </span>
              </Link>
            );
          })}
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
