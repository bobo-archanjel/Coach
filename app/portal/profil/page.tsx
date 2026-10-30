import { SignOutButton } from "../../components/SignOutButton";
import { DeleteAccountSection } from "./DeleteAccountSection";
import { TrainerConnection } from "./TrainerConnection";
import { loadProfilView } from "./profilView";
import styles from "../portal.module.css";

export default async function ProfilPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams;

  const view = await loadProfilView(preview);

  return (
    <div className={styles.profilePage}>
      <div className={styles.profileHead}>
        <h1>Profil</h1>
        <p>Kód pre trénera, stav prepojenia a nastavenia účtu.</p>
      </div>

      <div className={styles.profileStack}>
        <TrainerConnection code={view.code} hasTrainer={view.hasTrainer} trainerName={view.trainerName} />

        <div className={styles.panel}>
          <p className={styles.panelLabel}>Osobné údaje</p>
          <p className={styles.codeHint} style={{ marginTop: 0 }}>
            Vek, výška, váha, ciele a alergie z onboardingu si tu doplníš onedlho — potom uvidíš aj svoj progres v čase.
          </p>
        </div>

        <DeleteAccountSection requestedAt={view.deletionRequestedAt} requestedBy={view.deletionRequestedBy} />

        {/* Nad 880px je odhlásenie už v sidebari (PortalNav .navFoot) — tu netreba duplicitu. */}
        <div className={styles.profileSignOut}>
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
