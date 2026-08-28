import { SignOutButton } from "../../components/SignOutButton";
import { ComingSoon } from "../ComingSoon";
import { ProfileIcon } from "../icons";
import styles from "../portal.module.css";

export default function ProfilPage() {
  return (
    <>
      <ComingSoon icon={<ProfileIcon />} title="Tvoj profil">
        Onedlho si tu doplníš vek, výšku, váhu, ciele a alergie z onboardingu a uvidíš svoj progres
        v čase. Zatiaľ portál beží na ukážkových dátach.
      </ComingSoon>
      {/* Nad 880px je odhlásenie už v sidebari (PortalNav .navFoot) — tu netreba duplicitu. */}
      <div className={styles.profileSignOut}>
        <SignOutButton />
      </div>
    </>
  );
}
