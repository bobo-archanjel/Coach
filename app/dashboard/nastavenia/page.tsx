import { createClient } from "@/lib/supabase/server";
import styles from "../dashboard.module.css";

export default async function NastaveniaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? "—";
  const email = user?.email ?? "—";

  return (
    <>
      <div className={styles.pageHead}>
        <h1>Nastavenia</h1>
        <p>Základné údaje konta. Úprava profilu a fakturácia sú ďalšia úloha.</p>
      </div>

      <div className={styles.settingsGrid}>
        <div className={styles.card}>
          <h3>Profil</h3>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Meno</span>
            <span className={styles.infoValue}>{fullName}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>E-mail</span>
            <span className={styles.infoValue}>{email}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Rola</span>
            <span className={styles.infoValue}>Tréner</span>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.settingsRowHead}>
            <h3 style={{ marginBottom: 0 }}>Notifikácie</h3>
            <span className={styles.comingSoon}>čoskoro</span>
          </div>
          <p style={{ color: "var(--paper-dim)", fontSize: 13.5, marginTop: 10 }}>
            E-mailové upozornenia na meškajúcich klientov a týždenné súhrny.
          </p>
        </div>

        <div className={styles.card}>
          <div className={styles.settingsRowHead}>
            <h3 style={{ marginBottom: 0 }}>Fakturácia</h3>
            <span className={styles.comingSoon}>čoskoro</span>
          </div>
          <p style={{ color: "var(--paper-dim)", fontSize: 13.5, marginTop: 10 }}>
            Predplatné a platobné údaje pribudnú vo Fáze 3 (Stripe).
          </p>
        </div>
      </div>
    </>
  );
}
