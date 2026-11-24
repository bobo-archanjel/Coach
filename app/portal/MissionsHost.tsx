import { getTranslations } from "next-intl/server";
import { createClient, getMyClient, getUser } from "@/lib/supabase/server";
import { syncMissions } from "@/lib/gamification/missionsServer";
import { XP_MISSION_BONUS } from "@/lib/gamification/xp";
import { todayIso } from "@/lib/reports/period";
import { MissionsCard, type MissionVM } from "./MissionsCard";

/* Misie týždňa (lib/gamification/missions.ts) — server komponent: pri prvom zobrazení týždňa ich vygeneruje
   a uloží, progres vypočíta z dát a splnenie zapíše (idempotentne). Nič nezobrazí, keď migrácia 0084 ešte nebeží
   alebo klient nemá portálový účet. Kompaktná verzia je na karte Dnes, plná na stránke Úspechy. */
export async function MissionsHost({ compact = false }: { compact?: boolean }) {
  const {
    data: { user },
  } = await getUser();
  if (!user) return null;
  const { data: client } = await getMyClient(user.id);
  if (!client) return null;
  const res = await syncMissions(await createClient(), { clientId: client.id, activePlanId: client.active_plan_id ?? null }, todayIso());
  if (!res) return null;

  const t = await getTranslations("gamification.missions");
  const missions: MissionVM[] = res.views.map((v) => {
    const goal = v.progress.goal;
    const done = v.completedAt != null || v.progress.done;
    const text = t(`kind.${v.kind}` as never, { n: v.target, exercise: v.params.exerciseName ?? "", kg: v.target } as never);
    const value = done ? goal : v.progress.value;
    const progressText = v.kind === "volume" ? t("progressKg", { value, goal }) : t("progress", { value, goal });
    return { id: v.id, text, value, goal, done, xp: v.xp, progressText, aria: t("aria", { title: text, value, goal }) };
  });
  const doneCount = missions.filter((m) => m.done).length;
  return (
    <MissionsCard
      weekStart={res.weekStart}
      missions={missions}
      allDone={res.allDone}
      compact={compact}
      labels={{
        title: compact ? t("compactTitle", { done: doneCount, total: missions.length }) : t("title"),
        sub: t("sub"),
        bonusPending: t("bonusPending", { xp: XP_MISSION_BONUS }),
        bonusDone: t("bonusDone", { xp: XP_MISSION_BONUS }),
        allDoneTitle: t("allDoneTitle"),
        celebrate: t("celebrate"),
        viewAll: t("viewAll"),
        done: t("done"),
      }}
    />
  );
}
