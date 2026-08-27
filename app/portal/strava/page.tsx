import { ComingSoon } from "../ComingSoon";
import { FoodIcon } from "../icons";

export default function StravaPage() {
  return (
    <ComingSoon icon={<FoodIcon />} title="Denník stravy">
      Čoskoro si sem zapíšeš jedlá a nápoje počas dňa a uvidíš, ako sedíš s kalóriami a makrami
      voči cieľu od trénera.
    </ComingSoon>
  );
}
