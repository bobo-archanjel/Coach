import { cookies } from "next/headers";
import { AppLink as Link } from "@/app/components/AppLink";
import { ChangePasswordForm } from "@/app/components/ChangePasswordForm";
import { SignOutButton } from "@/app/components/SignOutButton";
import { DeleteAccountSection } from "@/app/portal/profil/DeleteAccountSection";
import { TrainerConnection } from "@/app/portal/profil/TrainerConnection";
import { loadProfilView } from "@/app/portal/profil/profilView";
import { getUser } from "@/lib/supabase/server";
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

  return (
    <>
      <header>
        <h1 className={s.pageTitle}>{t("title")}</h1>
        <p className={s.pageSub}>{t("subtitle")}</p>
      </header>

      <div className={s.profileStack}>
        <TrainerConnection code={view.code} hasTrainer={view.hasTrainer} trainerName={view.trainerName} />

        <div className={s.panel}>
          <p className={s.panelLabel}>{t("appearance")}</p>
          <ThemeSwitch initial={theme} />
          <p className={s.hint}>{t("appearanceHint")}</p>
        </div>

        <div className={s.panel}>
          <p className={s.panelLabel}>{tl("title")}</p>
          <LanguageSelect />
          <p className={s.hint}>{tl("hint")}</p>
        </div>

        {userData.user?.email && (
          <div className={s.panel}>
            <p className={s.panelLabel}>{t("password")}</p>
            <ChangePasswordForm email={userData.user.email} />
          </div>
        )}

        <div className={s.panel}>
          <p className={s.panelLabel}>{t("personal")}</p>
          <p className={s.codeHint} style={{ marginTop: 0 }}>
            {t("personalHint")}
          </p>
        </div>

        <div className={s.panel}>
          <p className={s.panelLabel}>{t("tour")}</p>
          <p className={s.codeHint} style={{ marginTop: 0, marginBottom: 14 }}>
            {t("tourHint")}
          </p>
          <Link href="/portal?tour=1" className="btn btn-ghost btn-sm">
            {t("tourRestart")}
          </Link>
        </div>

        <DeleteAccountSection requestedAt={view.deletionRequestedAt} requestedBy={view.deletionRequestedBy} />

        <div className={s.signOut}>
          <SignOutButton />
        </div>
      </div>
    </>
  );
}
