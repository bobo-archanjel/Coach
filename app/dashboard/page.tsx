import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AddClientForm } from "./AddClientForm";
import styles from "./dashboard.module.css";

/** Koľko dní bez odklikaného tréningu už znamená "mešká" (Track "Tréner" #2, ROADMAP.md). */
const LATE_THRESHOLD_DAYS = 5;

type ClientStatus = { label: string; days: number; tone: "active" | "late" } | null;

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

  const clientIds = (clients ?? []).map((c) => c.id);
  const statusByClient = new Map<string, ClientStatus>();

  if (clientIds.length > 0) {
    // "Mešká" = má priradený plán, ale posledný odklikaný tréning (alebo pridelenie
    // plánu, ak ešte necvičil vôbec) je viac ako LATE_THRESHOLD_DAYS dozadu. Bez
    // nového migračného kroku — počíta sa z existujúcich workout_plans/workout_logs.
    const [{ data: plans }, { data: logs }] = await Promise.all([
      supabase
        .from("workout_plans")
        .select("client_id, created_at")
        .in("client_id", clientIds)
        .order("created_at", { ascending: false }),
      supabase
        .from("workout_logs")
        .select("client_id, performed_on")
        .in("client_id", clientIds)
        .order("performed_on", { ascending: false }),
    ]);

    const latestPlanByClient = new Map<string, string>();
    for (const p of plans ?? []) {
      if (!latestPlanByClient.has(p.client_id)) latestPlanByClient.set(p.client_id, p.created_at);
    }
    const latestLogByClient = new Map<string, string>();
    for (const l of logs ?? []) {
      if (!latestLogByClient.has(l.client_id)) latestLogByClient.set(l.client_id, l.performed_on);
    }

    const todayMs = Date.now();
    for (const [clientId, planCreatedAt] of latestPlanByClient) {
      const reference = latestLogByClient.get(clientId) ?? planCreatedAt;
      const days = Math.floor((todayMs - new Date(reference).getTime()) / 86_400_000);
      statusByClient.set(
        clientId,
        days >= LATE_THRESHOLD_DAYS
          ? { label: `${days} dní bez tréningu`, days, tone: "late" }
          : { label: "aktívny", days, tone: "active" },
      );
    }
  }

  const lateClients = (clients ?? []).filter((c) => statusByClient.get(c.id)?.tone === "late");

  return (
    <>
      <div className={styles.pageHead}>
        <h1>Klienti</h1>
        <p>{clients?.length ?? 0} klientov v starostlivosti — kliknutím otvoríš detail.</p>
      </div>

      {lateClients.length > 0 && (
        <div className={styles.alertPanel} role="status">
          <p className={styles.alertPanelTitle}>
            {lateClients.length === 1 ? "1 klient mešká s tréningom" : `${lateClients.length} klienti meškajú s tréningom`}
          </p>
          <ul className={styles.alertPanelList}>
            {lateClients.map((c) => (
              <li key={c.id}>
                <Link href={`/dashboard/klienti/${c.id}`}>{c.full_name}</Link>
                <span>{statusByClient.get(c.id)?.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AddClientForm />

      {clients && clients.length > 0 ? (
        <div className={styles.roster}>
          {clients.map((client) => {
            const status = statusByClient.get(client.id);
            return (
              <Link key={client.id} href={`/dashboard/klienti/${client.id}`} className={styles.clientCard}>
                <div>
                  <div className={styles.clientName}>{client.full_name}</div>
                  {client.goal && <div className={styles.clientGoal}>{client.goal}</div>}
                </div>
                <span className={styles.clientMeta}>
                  {status && <span className={`${styles.statusChip} ${styles[status.tone]}`}>{status.label}</span>}
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
