import { AppLink as Link } from "../../components/AppLink";
import { createClient, getUser } from "@/lib/supabase/server";
import { getTrainerAiUsageSummary } from "@/lib/ai/usageSummary";
import { getTranslations } from "next-intl/server";
import styles from "@/app/dashboard/dashboard.module.css";
import { v6Theme } from "@/app/dashboard/dashTheme";
import { ThemeSwitch } from "@/app/v6design/ThemeSwitch";
import { SignOutButton } from "@/app/components/SignOutButton";
import pa from "@/app/components/planActions.module.css";
import { ActionResumeIcon } from "@/app/components/ActionIcons";
import { ChangePasswordForm } from "@/app/components/ChangePasswordForm";
import { LanguageSelect } from "@/app/components/LanguageSelect";
import { DeleteTrainerAccount } from "./DeleteTrainerAccount";
import { BrandingForm } from "./BrandingForm";
import { getMyTrainerBilling } from "@/lib/billing/server";
import { brandingPublicUrl } from "@/lib/branding/server";
import billingStyles from "../billing.module.css";
import brandingStyles from "./branding.module.css";

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

  const tb = await getTranslations("branding");
  const billing = user ? await getMyTrainerBilling(user.id) : null;
  const brandingUnlocked = billing?.state.features.branding === true;
  // uložená značka trénera (RLS: len vlastný riadok); pred migráciou 0075 tabuľka chýba → prázdne
  const { data: brandingRow } =
    user && brandingUnlocked
      ? await supabase
          .from("trainer_branding")
          .select("brand_name, accent_color, welcome_text, logo_path, photo_path, invite_slug")
          .eq("trainer_id", user.id)
          .maybeSingle()
      : { data: null };

  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? "—";
  const email = user?.email ?? "—";
  const [aiUsage, deletionRequestedAt] = user
    ? await Promise.all([
        getTrainerAiUsageSummary(supabase, user.id),
        // samostatný dopyt — pred migráciou 0062 stĺpec neexistuje, chyba = žiadna žiadosť
        supabase
          .from("profiles")
          .select("deletion_requested_at")
          .eq("id", user.id)
          .maybeSingle()
          .then(({ data, error }) => (error ? null : ((data?.deletion_requested_at as string | null) ?? null))),
      ])
    : [null, null];

  return (
    <div className={styles.settingsPage}>
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
          <h3>{t("billing")}</h3>
          <p style={{ color: "var(--paper-dim)", fontSize: 13.5, marginBottom: 14 }}>{t("billingHint")}</p>
          <Link href="/dashboard/predplatne" className={`${pa.action} ${pa.small} ${pa.inline}`} data-testid="open-billing">
            {t("billingOpen")}
          </Link>
        </div>

        {user && (
          <div className={`${styles.card} ${brandingStyles.wide}`} data-testid="branding-card">
            <div className={brandingStyles.head}>
              <h3>{tb("title")}</h3>
              <span className={brandingStyles.badge}>{tb("badge")}</span>
            </div>
            {brandingUnlocked ? (
              <>
                <p className={brandingStyles.sub}>{tb("subtitle")}</p>
                <BrandingForm
                  initial={{
                    brandName: brandingRow?.brand_name ?? "",
                    welcomeText: brandingRow?.welcome_text ?? "",
                    accent: brandingRow?.accent_color ?? null,
                    logoUrl: brandingPublicUrl(brandingRow?.logo_path),
                    photoUrl: brandingPublicUrl(brandingRow?.photo_path),
                    invitePath: brandingRow?.invite_slug ? `/pozvanka/${brandingRow.invite_slug}` : null,
                  }}
                />
              </>
            ) : (
              <div className={billingStyles.locked} role="note" data-testid="feature-locked" data-feature="branding">
                <span className={billingStyles.lockIcon} aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="11" width="16" height="9" rx="2.5" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                  </svg>
                </span>
                <div className={billingStyles.lockBody}>
                  <strong>{tb("locked.title")}</strong>
                  <p>{tb("locked.text")}</p>
                  <Link href="/dashboard/predplatne" className={billingStyles.lockLink}>
                    {tb("locked.upgrade")}
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        <div className={styles.card} data-tour="settings-guide">
          <h3>{t("tour")}</h3>
          <p style={{ color: "var(--paper-dim)", fontSize: 13.5, marginTop: 10, marginBottom: 14 }}>{t("tourHint")}</p>
          <Link href="/dashboard?tour=1" className={`${pa.action} ${pa.small} ${pa.inline}`}>
            <ActionResumeIcon />
            {t("tourRestart")}
          </Link>
        </div>

        {/* úplne dole — ako „Zmazanie dát“ v Profile klienta */}
        {user && <DeleteTrainerAccount requestedAt={deletionRequestedAt} />}
      </div>
    </div>
  );
}
