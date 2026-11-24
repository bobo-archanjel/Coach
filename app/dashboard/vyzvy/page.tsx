import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient, getUser } from "@/lib/supabase/server";
import { getMyTrainerBilling } from "@/lib/billing/server";
import { leaderboardUnlocked } from "@/lib/gamification/gate";
import { gamificationLimits } from "@/lib/gamification/limits";
import { loadTrainerChallenges } from "@/lib/gamification/challengesServer";
import { addDaysIso, todayIso } from "@/lib/reports/period";
import { ChallengeForm } from "./ChallengeForm";
import { ChallengeList } from "./ChallengeList";
import { LeaderboardSetting } from "./LeaderboardSetting";
import styles from "@/app/dashboard/dashboard.module.css";
import g from "@/app/components/gamification.module.css";

/* /dashboard/vyzvy — výzvy pre klientov a nastavenie rebríčka (všetky tarify). Starter a skúška:
   1 aktívna výzva, 2 typy, len všetci klienti (limity v lib/billing/plans.ts); zápisy a limity
   znova overuje server (actions.ts), UI je len pohodlie. */

export default async function VyzvyPage() {
  const {
    data: { user },
  } = await getUser();
  if (!user) redirect("/prihlasenie");
  const [t, { state }] = await Promise.all([getTranslations("gamification.challenges"), getMyTrainerBilling(user.id)]);

  const head = (
    <div className={styles.pageHead}>
      <h1>{t("page.title")}</h1>
      <p>{t("page.subtitle")}</p>
    </div>
  );

  const supabase = await createClient();
  const today = todayIso();
  const [challenges, clientsRes, settingRes] = await Promise.all([
    loadTrainerChallenges(supabase, user.id, today),
    supabase.from("clients").select("id, full_name").eq("trainer_id", user.id).is("ended_at", null).is("deletion_requested_at", null).order("full_name").limit(500),
    supabase.from("trainer_gamification_settings").select("leaderboard_enabled").eq("trainer_id", user.id).maybeSingle(),
  ]);
  const clients = (clientsRes.data ?? []) as { id: string; full_name: string }[];
  const activeCount = (challenges ?? []).filter((c) => c.status === "active").length;
  const limits = gamificationLimits(state.accessTier);
  const limited = limits.maxActiveChallenges === 1; // Starter / skúška
  const leaderboardEnabled = settingRes.data ? settingRes.data.leaderboard_enabled !== false : true;

  return (
    <>
      {head}
      <div className={g.tcStack}>
        {challenges === null && <p className={g.empty}>{t("trainer.unavailable")}</p>}

        {leaderboardUnlocked(state) && (
          <section className={styles.card} aria-label={t("trainer.leaderboardTitle")}>
            <h3>{t("trainer.leaderboardTitle")}</h3>
            <LeaderboardSetting enabled={leaderboardEnabled} />
          </section>
        )}

        <section className={styles.card} aria-label={t("trainer.newTitle")}>
          <h3>{t("trainer.newTitle")}</h3>
          <p className={g.tcHint} data-testid="challenge-counter" data-active={activeCount} data-max={limits.maxActiveChallenges}>
            {t("trainer.counter", { active: activeCount, max: limits.maxActiveChallenges })}
          </p>
          {activeCount > limits.maxActiveChallenges && (
            <p className={g.empty} data-testid="challenge-over-limit">
              {t("trainer.overLimit", { active: activeCount, max: limits.maxActiveChallenges })}
            </p>
          )}
          {activeCount >= limits.maxActiveChallenges ? (
            <p className={g.empty} data-testid="challenge-limit-reached">
              {limited ? t("errors.limitOne") : t("errors.limit", { max: limits.maxActiveChallenges })}
            </p>
          ) : clients.length === 0 ? (
            <p className={g.empty}>{t("trainer.noClients")}</p>
          ) : (
            <ChallengeForm
              clients={clients}
              today={today}
              defaultEnd={addDaysIso(today, 27)}
              allowedTypes={[...limits.challengeTypes]}
              canSelectClients={limits.challengeTargeting === "any"}
            />
          )}
        </section>

        <section className={styles.card} aria-label={t("trainer.listTitle")}>
          <h3>{t("trainer.listTitle")}</h3>
          <ChallengeList items={challenges ?? []} />
        </section>
      </div>
    </>
  );
}
