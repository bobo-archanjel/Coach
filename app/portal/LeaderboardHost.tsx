import { getMyClient, getUser } from "@/lib/supabase/server";
import { loadLeaderboard } from "@/lib/gamification/leaderboardServer";
import { todayIso } from "@/lib/reports/period";
import { LeaderboardCard } from "./LeaderboardCard";

/* Rebríček na stránke Úspechy. Nič nezobrazí, keď ho tréner nemá (tarifa) alebo ho vypol. */
export async function LeaderboardHost() {
  const {
    data: { user },
  } = await getUser();
  if (!user) return null;
  const { data: client } = await getMyClient(user.id);
  if (!client) return null;
  const view = await loadLeaderboard(client.id, client.trainer_id ?? null, todayIso());
  if (view.state === "unavailable") return null;
  return <LeaderboardCard metrics={view.state === "ready" ? view.metrics : []} boards={view.state === "ready" ? view.boards : null} hidden={view.state === "hidden"} />;
}
