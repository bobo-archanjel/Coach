import { ComingSoon } from "../ComingSoon";
import { ProfileIcon } from "../icons";

export default function ProfilPage() {
  return (
    <ComingSoon icon={<ProfileIcon />} title="Tvoj profil">
      Onedlho si tu doplníš vek, výšku, váhu, ciele a alergie z onboardingu a uvidíš svoj progres
      v čase. Zatiaľ portál beží na ukážkových dátach.
    </ComingSoon>
  );
}
