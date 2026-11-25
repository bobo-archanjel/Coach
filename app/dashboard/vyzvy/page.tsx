import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient, getUser } from "@/lib/supabase/server";
import { getMyTrainerBilling } from "@/lib/billing/server";
import { gamificationLimits } from "@/lib/gamification/limits";
import { loadTrainerChallenges } from "@/lib/gamification/challengesServer";
import { addDaysIso, todayIso } from "@/lib/reports/period";
import { ChallengeForm } from "./ChallengeForm";
import { ChallengeList } from "./ChallengeList";
import styles from "@/app/dashboard/dashboard.module.css";
import g from "@/app/components/gamification.module.css";
import v from "./vyzvy.module.css";

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
  const [challenges, clientsRes] = await Promise.all([
    loadTrainerChallenges(supabase, user.id, today),
    supabase.from("clients").select("id, full_name").eq("trainer_id", user.id).is("ended_at", null).is("deletion_requested_at", null).order("full_name").limit(500),
  ]);
  const clients = (clientsRes.data ?? []) as { id: string; full_name: string }[];
  const activeCount = (challenges ?? []).filter((c) => c.status === "active").length;
  const limits = gamificationLimits(state.accessTier);
  const limited = limits.maxActiveChallenges === 1; // Starter / skúška

  return (
    <>
      {head}
      <div className={v.stack}>
        {challenges === null && <p className={g.empty}>{t("trainer.unavailable")}</p>}

        <section className={styles.card} aria-label={t("trainer.newTitle")}>
          <div className={v.cardHead}>
            <h3>{t("trainer.newTitle")}</h3>
            <span className={v.counter} data-testid="challenge-counter" data-active={activeCount} data-max={limits.maxActiveChallenges}>
              {t("trainer.counter", { active: activeCount, max: limits.maxActiveChallenges })}
            </span>
          </div>
          {activeCount > limits.maxActiveChallenges && (
            <p className={v.notice} data-testid="challenge-over-limit">
              {t("trainer.overLimit", { active: activeCount, max: limits.maxActiveChallenges })}
            </p>
          )}
          {activeCount >= limits.maxActiveChallenges ? (
            <p className={v.notice} data-testid="challenge-limit-reached">
              {limited ? t("errors.limitOne") : t("errors.limit", { max: limits.maxActiveChallenges })}
            </p>
          ) : clients.length === 0 ? (
            <p className={v.notice}>{t("trainer.noClients")}</p>
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
