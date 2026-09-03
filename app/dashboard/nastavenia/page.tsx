import { createClient, getUser } from "@/lib/supabase/server";
import { getTrainerAiUsageSummary } from "@/lib/ai/usageSummary";
import styles from "../dashboard.module.css";

const usdFormat = (v: number) => `$${v.toFixed(v < 1 ? 3 : 2)}`;

export default async function NastaveniaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await getUser();

  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? "—";
  const email = user?.email ?? "—";
  const aiUsage = user ? await getTrainerAiUsageSummary(supabase, user.id) : null;

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
          <h3>AI náklady</h3>
          {aiUsage ? (
            <>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Dnes</span>
                <span className={styles.infoValue}>
                  {aiUsage.todayCount} {aiUsage.todayCount === 1 ? "správa" : "správy"} · ~{usdFormat(aiUsage.todayCostUsd)}
                </span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Posledných 7 dní</span>
                <span className={styles.infoValue}>
                  {aiUsage.weekCount} {aiUsage.weekCount === 1 ? "správa" : "správy"} · ~{usdFormat(aiUsage.weekCostUsd)}
                </span>
              </div>
              <p style={{ color: "var(--paper-dim)", fontSize: 12.5, marginTop: 10 }}>
                Orientačný odhad podľa cenníka modelu. Záväzný limit si nastav v Anthropic Console → Plans &amp; Billing.
              </p>
            </>
          ) : (
            <p style={{ color: "var(--paper-dim)", fontSize: 13.5 }}>Zatiaľ žiadne AI volania.</p>
          )}
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
