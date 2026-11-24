import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AppLink as Link } from "@/app/components/AppLink";
import { createClient, getUser } from "@/lib/supabase/server";
import { getMyTrainerBilling } from "@/lib/billing/server";
import { minTierFor } from "@/lib/billing/plans";
import { challengesUnlocked, leaderboardUnlocked } from "@/lib/gamification/gate";
import { loadTrainerChallenges } from "@/lib/gamification/challengesServer";
import { MAX_ACTIVE_CHALLENGES } from "@/lib/gamification/challenges";
import { addDaysIso, todayIso } from "@/lib/reports/period";
import { ChallengeForm } from "./ChallengeForm";
import { ChallengeList } from "./ChallengeList";
import { LeaderboardSetting } from "./LeaderboardSetting";
import billing from "@/app/dashboard/billing.module.css";
import styles from "@/app/dashboard/dashboard.module.css";
import g from "@/app/components/gamification.module.css";

/* /dashboard/vyzvy — výzvy pre klientov a nastavenie rebríčka (Pro, Business). Starter vidí
   zamknutú kartu s odkazom na Predplatné; zápisy zamyká server (lib/gamification/gate.ts je len UI). */

export default async function VyzvyPage() {
  const {
    data: { user },
  } = await getUser();
  if (!user) redirect("/prihlasenie");
  const [t, tb, { state }] = await Promise.all([getTranslations("gamification.challenges"), getTranslations("billing"), getMyTrainerBilling(user.id)]);

  const head = (
    <div className={styles.pageHead}>
      <h1>{t("page.title")}</h1>
      <p>{t("page.subtitle")}</p>
    </div>
  );

  if (!challengesUnlocked(state)) {
    const tier = tb(`tiers.${minTierFor("challenges")}`);
    return (
      <>
        {head}
        <div className={billing.locked} role="note" data-testid="challenges-locked" data-feature="challenges">
          <span className={billing.lockIcon} aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="11" width="16" height="9" rx="2.5" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          </span>
          <div className={billing.lockBody}>
            <strong>{t("locked.title", { tier })}</strong>
            <p>{t("locked.text", { tier })}</p>
            <Link href="/dashboard/predplatne" className={billing.lockLink}>
              {tb("lock.upgrade")}
            </Link>
          </div>
        </div>
      </>
    );
  }

  const supabase = await createClient();
  const today = todayIso();
  const [challenges, clientsRes, settingRes] = await Promise.all([
    loadTrainerChallenges(supabase, user.id, today),
    supabase.from("clients").select("id, full_name").eq("trainer_id", user.id).is("ended_at", null).is("deletion_requested_at", null).order("full_name").limit(500),
    supabase.from("trainer_gamification_settings").select("leaderboard_enabled").eq("trainer_id", user.id).maybeSingle(),
  ]);
  const clients = (clientsRes.data ?? []) as { id: string; full_name: string }[];
  const activeCount = (challenges ?? []).filter((c) => c.status === "active").length;
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
          {activeCount >= MAX_ACTIVE_CHALLENGES ? (
            <p className={g.empty}>{t("errors.limit", { max: MAX_ACTIVE_CHALLENGES })}</p>
          ) : clients.length === 0 ? (
            <p className={g.empty}>{t("trainer.noClients")}</p>
          ) : (
            <ChallengeForm clients={clients} today={today} defaultEnd={addDaysIso(today, 27)} />
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
