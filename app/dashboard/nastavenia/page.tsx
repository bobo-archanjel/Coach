import { createClient, getUser } from "@/lib/supabase/server";
import { getTrainerAiUsageSummary } from "@/lib/ai/usageSummary";
import { pluralSk } from "@/lib/portal/streak";
import { dashStyles, isV6Dashboard, v6Theme } from "@/app/dashboard/dashSkin";
import { ThemeSwitch } from "@/app/v6design/ThemeSwitch";

const usdFormat = (v: number) => `$${v.toFixed(v < 1 ? 3 : 2)}`;

export default async function NastaveniaPage() {
  const styles = await dashStyles();
  const supabase = await createClient();
  const {
    data: { user },
  } = await getUser();

  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? "—";
  const email = user?.email ?? "—";
  const aiUsage = user ? await getTrainerAiUsageSummary(supabase, user.id) : null;
  const v6 = await isV6Dashboard();

  return (
    <>
      <div className={styles.pageHead}>
        <h1>Nastavenia</h1>
        <p>Základné údaje tvojho konta.</p>
      </div>

      <div className={styles.settingsGrid}>
        {v6 && (
          // len pri dizajnovom experimente v6 (cookie z /v6design/dashboard)
          <div className={styles.card}>
            <h3>Vzhľad</h3>
            <ThemeSwitch initial={await v6Theme()} />
            <p style={{ color: "var(--paper-dim)", fontSize: 13, marginTop: 10 }}>
              Auto prepína svetlú a tmavú tému podľa nastavenia zariadenia.
            </p>
            {/* <a>, nie Link — route handler nastaví cookie a presmeruje */}
            <a href="/v6design/dashboard/off" className="btn btn-ghost btn-sm" style={{ marginTop: 12 }}>
              Prepnúť na pôvodný dizajn
            </a>
          </div>
        )}
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
                  {aiUsage.todayCount} {pluralSk(aiUsage.todayCount, "AI požiadavka", "AI požiadavky", "AI požiadaviek")} · ~
                  {usdFormat(aiUsage.todayCostUsd)}
                </span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Posledných 7 dní</span>
                <span className={styles.infoValue}>
                  {aiUsage.weekCount} {pluralSk(aiUsage.weekCount, "AI požiadavka", "AI požiadavky", "AI požiadaviek")} · ~
                  {usdFormat(aiUsage.weekCostUsd)}
                </span>
              </div>
              <p style={{ color: "var(--paper-dim)", fontSize: 12.5, marginTop: 10 }}>
                Orientačný odhad nákladov na AI funkcie tvojho konta — AI kouč klientov, generátor plánov a zhrnutia.
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
            Správa predplatného a platobných údajov tu bude dostupná čoskoro.
          </p>
        </div>
      </div>
    </>
  );
}
