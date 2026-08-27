import Link from "next/link";
import { mockClients } from "@/lib/mock/dashboard";
import styles from "../dashboard.module.css";

function pct(pair: [number, number]) {
  return Math.min(100, Math.round((pair[0] / pair[1]) * 100));
}

export default function VyzivaPage() {
  return (
    <>
      <div className={styles.pageHead}>
        <h1>Výživa</h1>
        <p>Plnenie makier za dnešný deň naprieč klientmi. Zostavovanie jedálničkov je ďalšia úloha.</p>
      </div>

      <div className={styles.clientSectionGrid}>
        {mockClients.map((client) => (
          <div key={client.id} className={styles.clientSection}>
            <div className={styles.clientSectionHead}>
              <span className={styles.clientName}>{client.name}</span>
              <Link href={`/dashboard/klienti/${client.id}`}>Detail klienta →</Link>
            </div>

            <div className={styles.macroBarRow}>
              <div className={styles.macroTop}>
                <span>Bielkoviny</span>
                <span className={styles.macroVal}>
                  {client.macros.protein[0]} / {client.macros.protein[1]} g
                </span>
              </div>
              <div className={styles.macroTrack}>
                <div className={`${styles.macroFill} ${styles.protein}`} style={{ width: `${pct(client.macros.protein)}%` }} />
              </div>
            </div>
            <div className={styles.macroBarRow} style={{ marginTop: 12 }}>
              <div className={styles.macroTop}>
                <span>Sacharidy</span>
                <span className={styles.macroVal}>
                  {client.macros.carbs[0]} / {client.macros.carbs[1]} g
                </span>
              </div>
              <div className={styles.macroTrack}>
                <div className={`${styles.macroFill} ${styles.carbs}`} style={{ width: `${pct(client.macros.carbs)}%` }} />
              </div>
            </div>
            <div className={styles.macroBarRow} style={{ marginTop: 12 }}>
              <div className={styles.macroTop}>
                <span>Tuky</span>
                <span className={styles.macroVal}>
                  {client.macros.fat[0]} / {client.macros.fat[1]} g
                </span>
              </div>
              <div className={styles.macroTrack}>
                <div className={`${styles.macroFill} ${styles.fat}`} style={{ width: `${pct(client.macros.fat)}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
