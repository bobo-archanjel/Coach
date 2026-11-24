import { cookies } from "next/headers";
import { AppLink as Link } from "@/app/components/AppLink";
import { ChangePasswordForm } from "@/app/components/ChangePasswordForm";
import { SignOutButton } from "@/app/components/SignOutButton";
import pa from "@/app/components/planActions.module.css";
import { ActionResumeIcon } from "@/app/components/ActionIcons";
import { DeleteAccountSection } from "@/app/portal/profil/DeleteAccountSection";
import { TrainerConnection } from "@/app/portal/profil/TrainerConnection";
import { loadProfilView } from "@/app/portal/profil/profilView";
import { createClient, getMyClient, getUser } from "@/lib/supabase/server";
import { EmailPrefs } from "@/app/portal/profil/EmailPrefs";
import { ThemeSwitch } from "@/app/v6design/ThemeSwitch";
import { V6_THEME_COOKIE, parseV6Theme } from "@/app/v6design/theme";
import { LanguageSelect } from "@/app/components/LanguageSelect";
import { getTranslations } from "next-intl/server";
import s from "../portal.module.css";

/* /portal/profil — údaje a akcie profilu (loadProfilView) + vzhľad (téma Auto/Svetlá/Tmavá)
   + opätovné spustenie onboarding návodu (?tour=1 na Dnes). */

export default async function ProfilPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;
  const [view, cookieStore, { data: userData }, t, tl] = await Promise.all([
    loadProfilView(preview),
    cookies(),
    getUser(),
    getTranslations("profile"),
    getTranslations("language"),
  ]);
  const theme = parseV6Theme(cookieStore.get(V6_THEME_COOKIE)?.value);
  const fullName = (userData.user?.user_metadata?.full_name as string | undefined)?.trim() || "—";
  const email = userData.user?.email ?? "—";

  // „Týždenné zhrnutie e-mailom“ (0082; predvolene zapnuté). null = nedostupné (bez účtu/klienta, DEV náhľad
  // alebo migrácia ešte nebehla) → prepínač sa neukáže.
  let weeklyEnabled: boolean | null = null;
  if (!preview && userData.user) {
    const supabase = await createClient();
    const { data: me } = await getMyClient(userData.user.id);
    if (me?.id) {
      const { data: pref, error: prefErr } = await supabase.from("client_email_prefs").select("weekly_summary").eq("client_id", me.id as string).maybeSingle();
      if (!prefErr) weeklyEnabled = (pref?.weekly_summary as boolean | undefined) ?? true;
    }
  }

  return (
    <>
      <header>
        <h1 className={s.pageTitle}>{t("title")}</h1>
        <p className={s.pageSub}>{t("subtitle")}</p>
      </header>

      <div className={s.profileStack}>
        <TrainerConnection code={view.code} hasTrainer={view.hasTrainer} trainerName={view.trainerName} />

        <div className={s.panel} data-tour="profile-appearance">
          <p className={s.panelLabel}>{t("appearance")}</p>
          <ThemeSwitch initial={theme} />
          <p className={s.hint}>{t("appearanceHint")}</p>
        </div>

        <div className={s.panel}>
          <p className={s.panelLabel}>{tl("title")}</p>
          <LanguageSelect />
          <p className={s.hint}>{tl("hint")}</p>
        </div>

        {/* Účet ako v Nastaveniach trénera (pod Vzhľadom a Jazykom): meno, e-mail, rola a odhlásenie — nie až na konci stránky */}
        <div className={s.panel} data-tour="profile-account">
          <p className={s.panelLabel}>{t("account")}</p>
          <dl className={s.accountRows}>
            <div className={s.accountRow}>
              <dt>{t("name")}</dt>
              <dd>{fullName}</dd>
            </div>
            <div className={s.accountRow}>
              <dt>{t("email")}</dt>
              <dd>{email}</dd>
            </div>
            <div className={s.accountRow}>
              <dt>{t("role")}</dt>
              <dd>{t("roleClient")}</dd>
            </div>
          </dl>
          <div className={s.accountSignOut}>
            <SignOutButton />
          </div>
        </div>

        {userData.user?.email && (
          <div className={s.panel}>
            <p className={s.panelLabel}>{t("password")}</p>
            <ChangePasswordForm email={userData.user.email} />
          </div>
        )}

        {weeklyEnabled !== null && <EmailPrefs weeklyEnabled={weeklyEnabled} />}

        <div className={s.panel}>
          <p className={s.panelLabel}>{t("personal")}</p>
          <p className={s.codeHint} style={{ marginTop: 0 }}>
            {t("personalHint")}
          </p>
        </div>

        <div className={s.panel} data-tour="profile-guide">
          <p className={s.panelLabel}>{t("tour")}</p>
          <p className={s.codeHint} style={{ marginTop: 0, marginBottom: 14 }}>
            {t("tourHint")}
          </p>
          <Link href="/portal?tour=1" className={`${pa.action} ${pa.small} ${pa.inline}`}>
            <ActionResumeIcon />
            {t("tourRestart")}
          </Link>
        </div>

        <DeleteAccountSection requestedAt={view.deletionRequestedAt} requestedBy={view.deletionRequestedBy} />
      </div>
    </>
  );
}
