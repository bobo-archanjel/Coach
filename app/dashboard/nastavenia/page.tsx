import { AppLink as Link } from "../../components/AppLink";
import { createClient, getUser } from "@/lib/supabase/server";
import { getTrainerAiUsageSummary } from "@/lib/ai/usageSummary";
import { getTranslations } from "next-intl/server";
import styles from "@/app/dashboard/dashboard.module.css";
import { v6Theme } from "@/app/dashboard/dashTheme";
import { ThemeSwitch } from "@/app/v6design/ThemeSwitch";
import { SignOutButton } from "@/app/components/SignOutButton";
import { ChangePasswordForm } from "@/app/components/ChangePasswordForm";
import { LanguageSelect } from "@/app/components/LanguageSelect";

const usdFormat = (v: number) => `$${v.toFixed(v < 1 ? 3 : 2)}`;

export default async function NastaveniaPage() {
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    t,
    tl,
  ] = await Promise.all([getUser(), getTranslations("settings"), getTranslations("language")]);

  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? "—";
  const email = user?.email ?? "—";
  const aiUsage = user ? await getTrainerAiUsageSummary(supabase, user.id) : null;

  return (
    <>
      <div className={styles.pageHead}>
        <h1>{t("title")}</h1>
        <p>{t("subtitle")}</p>
      </div>

      <div className={styles.settingsGrid}>
        <div className={styles.card}>
          <h3>{t("appearance")}</h3>
          <ThemeSwitch initial={await v6Theme()} />
          <p style={{ color: "var(--paper-dim)", fontSize: 13, marginTop: 10 }}>{t("appearanceHint")}</p>
        </div>
        <div className={styles.card}>
          <h3>{tl("title")}</h3>
          <LanguageSelect />
          <p style={{ color: "var(--paper-dim)", fontSize: 13, marginTop: 10 }}>{tl("hint")}</p>
        </div>
        <div className={styles.card}>
          <h3>{t("profile")}</h3>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>{t("name")}</span>
            <span className={styles.infoValue}>{fullName}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>{t("email")}</span>
            <span className={styles.infoValue}>{email}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>{t("role")}</span>
            <span className={styles.infoValue}>{t("roleTrainer")}</span>
          </div>
          {/* odhlásenie len tu — v hornej lište / bočnom paneli je avatar, ktorý sem vedie */}
          <div className={styles.settingsSignOut}>
            <SignOutButton />
          </div>
        </div>

        {user?.email && (
          <div className={styles.card}>
            <h3>{t("password")}</h3>
            <ChangePasswordForm email={user.email} />
          </div>
        )}

        <div className={styles.card}>
          <div className={styles.settingsRowHead}>
            <h3 style={{ marginBottom: 0 }}>{t("notifications")}</h3>
            <span className={styles.comingSoon}>{t("comingSoon")}</span>
          </div>
          <p style={{ color: "var(--paper-dim)", fontSize: 13.5, marginTop: 10 }}>{t("notificationsHint")}</p>
        </div>

        <div className={styles.card}>
          <h3>{t("aiCosts")}</h3>
          {aiUsage ? (
            <>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>{t("today")}</span>
                <span className={styles.infoValue}>
                  {t("aiRequests", { count: aiUsage.todayCount })} · ~{usdFormat(aiUsage.todayCostUsd)}
                </span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>{t("last7Days")}</span>
                <span className={styles.infoValue}>
                  {t("aiRequests", { count: aiUsage.weekCount })} · ~{usdFormat(aiUsage.weekCostUsd)}
                </span>
              </div>
              <p style={{ color: "var(--paper-dim)", fontSize: 12.5, marginTop: 10 }}>{t("aiCostsHint")}</p>
            </>
          ) : (
            <p style={{ color: "var(--paper-dim)", fontSize: 13.5 }}>{t("aiNone")}</p>
          )}
        </div>

        <div className={styles.card}>
          <div className={styles.settingsRowHead}>
            <h3 style={{ marginBottom: 0 }}>{t("billing")}</h3>
            <span className={styles.comingSoon}>{t("comingSoon")}</span>
          </div>
          <p style={{ color: "var(--paper-dim)", fontSize: 13.5, marginTop: 10 }}>{t("billingHint")}</p>
        </div>

        <div className={styles.card}>
          <h3>{t("tour")}</h3>
          <p style={{ color: "var(--paper-dim)", fontSize: 13.5, marginTop: 10, marginBottom: 14 }}>{t("tourHint")}</p>
          <Link href="/dashboard?tour=1" className="btn btn-ghost btn-sm">
            {t("tourRestart")}
          </Link>
        </div>
      </div>
    </>
  );
}
