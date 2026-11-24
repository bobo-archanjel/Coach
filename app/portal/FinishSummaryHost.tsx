import { getTranslations } from "next-intl/server";
import { getUser } from "@/lib/supabase/server";
import { readFinishSummary } from "@/lib/gamification/finishServer";
import { loadCosmetics } from "@/lib/gamification/cosmeticsServer";
import { XP_MISSION_BONUS } from "@/lib/gamification/xp";
import { FinishSummaryModal, type FinishVM } from "./FinishSummaryModal";

/* „Tréning v číslach“ v layoute portálu: po ukončení tréningu finishWorkoutAction uloží súhrn do krátkodobej
   cookie, layout sa obnoví a tento komponent ju prečíta (lib/gamification/finishServer.ts). Zavretie cookie zmaže. */
export async function FinishSummaryHost() {
  const summary = await readFinishSummary();
  if (!summary) return null;
  const {
    data: { user },
  } = await getUser();
  if (!user) return null;

  const t = await getTranslations("gamification.finish");
  const tm = await getTranslations("gamification.missions");
  const cosmetics = await loadCosmetics(user.id);
  const vm: FinishVM = {
    durationText: summary.durationMin != null ? t("durationValue", { min: summary.durationMin }) : null,
    volumeText: t("volumeValue", { kg: summary.volumeKg }),
    sets: summary.sets,
    prs: summary.prs,
    xp: summary.xp,
    missions: summary.missions.map((m, i) => ({
      key: `${m.kind}-${i}`,
      text: tm(`kind.${m.kind}` as never, { n: m.goal, exercise: m.exerciseName ?? "", kg: m.goal } as never),
      state: m.justDone ? t("justDone") : m.done ? tm("done") : tm("progress", { value: m.value, goal: m.goal }),
      done: m.done,
    })),
    bonusText: summary.bonus ? t("bonus", { xp: XP_MISSION_BONUS }) : null,
    streakText: t("streak", { count: summary.streakWeeks }),
    streakNote: summary.needThisWeek > 0 ? t("streakNeed", { count: summary.needThisWeek }) : t("streakDone"),
    freezeText: summary.freezeUsed ? t("freezeUsed") : null,
    levelText: summary.levelUp != null ? t("levelUp", { n: summary.levelUp }) : null,
    shareHref: `/api/gamification/share?w=${summary.weekStart}`,
    celebration: cosmetics.celebration,
    celebrate: summary.prs > 0 || summary.levelUp != null || summary.bonus || summary.missions.some((m) => m.justDone),
  };
  return (
    <FinishSummaryModal
      key={`${summary.weekStart}-${summary.xp}-${summary.volumeKg}-${summary.sets}`}
      vm={vm}
      labels={{
        title: t("title"),
        sub: t("sub"),
        aria: t("aria"),
        duration: t("duration"),
        volume: t("volume"),
        sets: t("sets"),
        prs: t("prs"),
        xp: t("xp"),
        xpFormat: t("xpValue", { xp: "{xp}" }),
        missions: t("missions"),
        close: t("close"),
      }}
    />
  );
}
