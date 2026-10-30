import Link from "next/link";
import { cookies } from "next/headers";
import { SignOutButton } from "@/app/components/SignOutButton";
import { DeleteAccountSection } from "@/app/portal/profil/DeleteAccountSection";
import { TrainerConnection } from "@/app/portal/profil/TrainerConnection";
import { loadProfilView } from "@/app/portal/profil/profilView";
import { ThemeSwitch } from "../../ThemeSwitch";
import { V6_THEME_COOKIE, parseV6Theme } from "../../theme";
import s from "../styles/portal.module.css";

/* /v6design/portal/profil — tie isté údaje (loadProfilView) a akcie ako /portal/profil
   + nastavenie vzhľadu experimentu (téma, návrat na pôvodný dizajn). */

export default async function V6ProfilPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;
  const [view, cookieStore] = await Promise.all([loadProfilView(preview), cookies()]);
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
          <Link href="/portal" className={s.oldDesignLink}>
            Prepnúť na pôvodný dizajn →
          </Link>
        </div>

        <div className={s.panel}>
          <p className={s.panelLabel}>Osobné údaje</p>
          <p className={s.codeHint} style={{ marginTop: 0 }}>
            Vek, výška, váha, ciele a alergie z onboardingu si tu doplníš onedlho — potom uvidíš aj svoj progres v čase.
          </p>
        </div>

        <DeleteAccountSection requestedAt={view.deletionRequestedAt} requestedBy={view.deletionRequestedBy} />

        <div className={s.signOut}>
          <SignOutButton />
        </div>
      </div>
    </>
  );
}
