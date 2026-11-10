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
import s from "../portal.module.css";

/* /portal/profil — údaje a akcie profilu (loadProfilView) + vzhľad (téma Auto/Svetlá/Tmavá)
   + opätovné spustenie onboarding návodu (?tour=1 na Dnes). */

export default async function ProfilPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;
  const [view, cookieStore, { data: userData }] = await Promise.all([
    loadProfilView(preview),
    cookies(),
    getUser(),
  ]);
  const theme = parseV6Theme(cookieStore.get(V6_THEME_COOKIE)?.value);

  return (
    <>
      <header>
        <h1 className={s.pageTitle}>Profil</h1>
        <p className={s.pageSub}>Kód pre trénera, stav prepojenia a nastavenia účtu.</p>
      </header>

      <div className={s.profileStack}>
        <TrainerConnection code={view.code} hasTrainer={view.hasTrainer} trainerName={view.trainerName} />

        <div className={s.panel}>
          <p className={s.panelLabel}>Vzhľad</p>
          <ThemeSwitch initial={theme} />
          <p className={s.hint}>Auto prepína svetlú a tmavú tému podľa nastavenia telefónu.</p>
        </div>

        {userData.user?.email && (
          <div className={s.panel}>
            <p className={s.panelLabel}>Heslo</p>
            <ChangePasswordForm email={userData.user.email} />
          </div>
        )}

        <div className={s.panel}>
          <p className={s.panelLabel}>Osobné údaje</p>
          <p className={s.codeHint} style={{ marginTop: 0 }}>
            Vek, výška, váha, ciele a alergie z onboardingu si tu doplníš onedlho — potom uvidíš aj svoj progres v čase.
          </p>
        </div>

        <div className={s.panel}>
          <p className={s.panelLabel}>Návod</p>
          <p className={s.codeHint} style={{ marginTop: 0, marginBottom: 14 }}>
            Krátky sprievodca appkou, ktorý si videl pri prvom prihlásení.
          </p>
          <Link href="/portal?tour=1" className="btn btn-ghost btn-sm">
            Spustiť návod znova
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
