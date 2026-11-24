import { getTranslations } from "next-intl/server";
import { createClient, getMyClient, getUser } from "@/lib/supabase/server";
import { loadLeaderboard } from "@/lib/gamification/leaderboardServer";
import { todayIso } from "@/lib/reports/period";
import { LeaderboardCard } from "./LeaderboardCard";

/* Celoappkový rebríček na stránke Úspechy (lib/gamification/leaderboardServer.ts). Nič nezobrazí, keď migrácia 0084
   ešte nebeží. Skrytý klient dostane len kartu s prepínačom (rebríček sám nevidí). */
export async function LeaderboardHost() {
  const {
    data: { user },
  } = await getUser();
  if (!user) return null;
  const { data: client } = await getMyClient(user.id);
  if (!client) return null;
  const t = await getTranslations("gamification.leaderboard");
  const view = await loadLeaderboard(
    await createClient(),
    { clientId: client.id, trainerId: client.trainer_id ?? null, fullName: (client.full_name as string | null) ?? null, today: todayIso() },
    t("anonymous"),
  );
  if (view.state === "unavailable") return null;
  return (
    <LeaderboardCard
      metrics={view.state === "ready" ? view.metrics : []}
      boards={view.state === "ready" ? view.boards : null}
      hidden={view.state === "hidden"}
      me={view.me}
    />
  );
}
