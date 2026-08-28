import { SignOutButton } from "../../components/SignOutButton";
import { ComingSoon } from "../ComingSoon";
import { ProfileIcon } from "../icons";

export default function ProfilPage() {
  return (
    <>
      <ComingSoon icon={<ProfileIcon />} title="Tvoj profil">
        Onedlho si tu doplníš vek, výšku, váhu, ciele a alergie z onboardingu a uvidíš svoj progres
        v čase. Zatiaľ portál beží na ukážkových dátach.
      </ComingSoon>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
        <SignOutButton />
      </div>
    </>
  );
}
