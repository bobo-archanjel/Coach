import { getTranslations } from "next-intl/server";
import { getMyClient, getUser } from "@/lib/supabase/server";
import { todayIso } from "@/lib/reports/period";
import { loadCosmetics } from "@/lib/gamification/cosmeticsServer";
import { loadTodayRingsCached } from "@/lib/gamification/ringsServer";
import { celebrationDue } from "@/lib/gamification/rings";
import { RingsCelebration } from "./RingsCelebration";

/* Oslava „Všetky kruhy uzavreté!“ v layoute portálu: keď sú dnes uzavreté všetky viditeľné prstence a oslava ešte
   nebola, vykreslí sa klientský ostrovček, ktorý cez server akciu deň zapíše (raz za deň, +XP) a spustí oslavu vo
   zvolenom štýle. Akcie, ktoré môžu posledný kruh zatvoriť (koniec tréningu, zápis jedla, odpočinok), obnovia layout,
   takže oslava príde hneď po nich; zároveň sa ukáže aj pri otvorení Dnes, ak je zatvorené, ale ešte neoslávené.
   Keď je deň oslávený alebo kruhy nie sú hotové, nič sa nevykreslí. */
export async function RingsHost() {
  const {
    data: { user },
  } = await getUser();
  if (!user) return null;
  const { data: client } = await getMyClient(user.id);
  if (!client) return null;
  const today = todayIso();
  const state = await loadTodayRingsCached(client.id, today);
  if (!state || state.celebratedToday || !celebrationDue(state.rings, null, today)) return null;
  const [t, cosmetics] = await Promise.all([getTranslations("gamification.daily"), loadCosmetics(user.id)]);
  return (
    <RingsCelebration
      today={today}
      style={cosmetics.celebration}
      labels={{ message: t("celebrate"), xp: t("celebrateXp", { xp: "{xp}" }), close: t("celebrateClose") }}
    />
  );
}
