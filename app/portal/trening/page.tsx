import { ComingSoon } from "../ComingSoon";
import { TrainingIcon } from "../icons";

export default function TreningPage() {
  return (
    <ComingSoon icon={<TrainingIcon />} title="Odklikávanie tréningu">
      Onedlho tu spustíš dnešný tréning, odškrtneš každú sériu a zapíšeš skutočné váhy a opakovania.
      Zatiaľ nájdeš dnešný plán na karte Dnes.
    </ComingSoon>
  );
}
