import Link from "next/link";
import { mockClients } from "@/lib/mock/dashboard";
import styles from "./dashboard.module.css";

const STATUS_LABEL: Record<string, string> = {
  active: "aktívny",
  late: "meškanie",
};

export default function ClientsPage() {
  return (
    <>
      <div className={styles.pageHead}>
        <h1>Klienti</h1>
        <p>{mockClients.length} klientov v starostlivosti — kliknutím otvoríš detail.</p>
      </div>

      {mockClients.length > 0 ? (
        <div className={styles.roster}>
          {mockClients.map((client) => (
            <Link key={client.id} href={`/dashboard/klienti/${client.id}`} className={styles.clientCard}>
              <div>
                <div className={styles.clientName}>{client.name}</div>
                <div className={styles.clientGoal}>{client.goal}</div>
              </div>
              <div className={styles.clientMeta}>
                <span className={styles.clientSince}>{client.lastLogLabel}</span>
                <span className={`${styles.statusChip} ${styles[client.status]}`}>
                  {STATUS_LABEL[client.status]}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <h2>Zatiaľ nemáš žiadnych klientov</h2>
          <p>Pridávanie klientov a pozývacie kódy sú ďalšia úloha na roadmape.</p>
        </div>
      )}
    </>
  );
}
