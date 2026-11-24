import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient, getMyClient, getUser } from "@/lib/supabase/server";
import { getUserLocale } from "@/lib/i18n/server";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import { BADGE_CATEGORIES, badgeById, type BadgeView } from "@/lib/gamification/badges";
import { loadGalleryData, type GalleryData } from "@/lib/gamification/server";
import { todayIso } from "@/lib/reports/period";
import { BadgeIcon, LockIcon } from "@/app/components/BadgeIcon";
import { ShareButton } from "@/app/components/ShareButton";
import { Suspense } from "react";
import { ChallengesHost } from "../ChallengesCard";
import { LeaderboardHost } from "../LeaderboardHost";
import { WeeklySummaryHost } from "../WeeklySummaryHost";
import g from "@/app/components/gamification.module.css";
import s from "../portal.module.css";

/* /portal/uspechy — úroveň, galéria odznakov (získané s dátumom, zamknuté zosivené, skryté „???“
   do získania), zoznam rekordov a posledné úspechy. Dáta: lib/gamification/server.ts. Pri prvom
   zobrazení klienta s históriou sa spätne dopočítajú odznaky a rekordy — ticho, bez oslavy. */

function dateLabel(iso: string, locale: Locale): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" });
}

export default async function UspechyPage() {
  const {
    data: { user },
  } = await getUser();
  if (!user) redirect("/prihlasenie");
  const { data: client } = await getMyClient(user.id);
  const [t, locale] = await Promise.all([getTranslations("gamification"), getUserLocale()]);

  const data = client
    ? await loadGalleryData(await createClient(), { clientId: client.id, activePlanId: client.active_plan_id ?? null }, todayIso())
    : null;

  return (
    <>
      <header>
        <h1 className={s.pageTitle}>{t("title")}</h1>
        <p className={s.pageSub}>{t("subtitle")}</p>
      </header>
      {data ? (
        <div className={g.stack}>
          <Suspense fallback={null}>
            <WeeklySummaryHost mode="always" />
          </Suspense>
          <Suspense fallback={null}>
            <ChallengesHost />
          </Suspense>
          <Suspense fallback={null}>
            <LeaderboardHost />
          </Suspense>
          <Gallery data={data} locale={locale} />
        </div>
      ) : (
        <p className={g.empty}>{t("unavailable")}</p>
      )}
    </>
  );
}

async function Gallery({ data, locale }: { data: GalleryData; locale: Locale }) {
  const t = await getTranslations("gamification");
  const { level, xp } = data;
  const percent = Math.round(level.fraction * 100);
  const earnedCount = data.badges.filter((b) => b.earned).length;
  const byCategory = (cat: string) => data.badges.filter((b) => b.category === cat);

  return (
    <div className={g.stack}>
      <section className={`${g.card} ${g.levelCard}`} aria-label={t("level.name", { name: t(`levels.${level.level}`) })}>
        <div className={g.levelHead}>
          <span className={g.levelName}>{t("level.name", { name: t(`levels.${level.level}`) })}</span>
          <span className={g.levelXp}>{t("level.xp", { xp: level.xp })}</span>
        </div>
        <div
          className={g.bar}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={level.next ? t("level.progressAria", { next: t(`levels.${level.next}`), percent }) : t("level.maxAria")}
        >
          <span className={g.barFill} style={{ width: `${percent}%` }} />
        </div>
        <p className={g.levelFoot}>
          {level.next && level.toNext != null
            ? t("level.toNext", { count: level.toNext, next: t(`levels.${level.next}`) })
            : t("level.max")}
        </p>
        <ul className={g.xpList} aria-label={t("xpBreakdown.title")}>
          <li>
            <span>{t("xpBreakdown.workouts")}</span>
            <span>{xp.workouts}</span>
          </li>
          <li>
            <span>{t("xpBreakdown.food")}</span>
            <span>{xp.food}</span>
          </li>
          <li>
            <span>{t("xpBreakdown.prs")}</span>
            <span>{xp.prs}</span>
          </li>
          <li>
            <span>{t("xpBreakdown.badges")}</span>
            <span>{xp.badges}</span>
          </li>
        </ul>
      </section>

      {data.recent.length > 0 && (
        <section className={g.card}>
          <h2 className={g.cardTitle}>{t("recent.title")}</h2>
          <ul className={g.recentList}>
            {data.recent.map((r) => (
              <li key={r.id} className={g.recentRow}>
                <span>
                  {r.kind === "pr" && r.exerciseName && r.value != null
                    ? t("recent.pr", { exercise: r.exerciseName, weight: r.value })
                    : r.kind === "challenge" && r.challengeName
                      ? t("recent.challenge", { name: r.challengeName })
                      : r.badgeId && badgeById(r.badgeId)
                        ? t("recent.badge", { name: t(`badges.${r.badgeId}.name` as never) })
                        : null}
                </span>
                <span className={g.shareRow}>
                  {r.highFived && <span className={g.hf}>🙌 {t("recent.highFive")}</span>}
                  <ShareButton href={`/api/gamification/share?a=${r.id}`} fileName="fitpilot-uspech.png" />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={g.card}>
        <h2 className={g.cardTitle}>{t("records.title")}</h2>
        {data.records.length === 0 ? (
          <p className={g.empty}>{t("records.empty")}</p>
        ) : (
          <ul className={g.recordList}>
            {data.records.map((r) => (
              <li key={r.exerciseKey} className={g.recordRow}>
                <span className={g.recordName}>{r.exerciseName}</span>
                <span className={g.recordVal}>
                  {t("records.best", { weight: r.bestWeightKg, reps: r.bestWeightReps })}
                  <span className={g.recordSub}>
                    {r.bestE1rm != null ? `${t("records.e1rm", { value: r.bestE1rm })} · ` : ""}
                    {t("records.last", { date: dateLabel(r.lastOn, locale) })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={g.card}>
        <h2 className={g.cardTitle}>
          {t("gallery.title")} · {t("gallery.count", { count: earnedCount, total: data.badges.length })}
        </h2>
        <div className={g.stack}>
          {BADGE_CATEGORIES.map((cat) => {
            const list = byCategory(cat);
            if (list.length === 0) return null;
            return (
              <div key={cat}>
                <h3 className={g.catTitle}>
                  <span>{t(`categories.${cat}`)}</span>
                  <span className={g.catCount}>
                    {list.filter((b) => b.earned).length}/{list.length}
                  </span>
                </h3>
                <ul className={g.badgeGrid}>
                  {list.map((b) => (
                    <BadgeCard key={b.id} badge={b} locale={locale} />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

async function BadgeCard({ badge, locale }: { badge: BadgeView & { backfilled: boolean }; locale: Locale }) {
  const t = await getTranslations("gamification");
  const cls = `${g.badge} ${badge.earned ? g.badgeEarned : g.badgeLocked}`;
  return (
    <li className={cls} data-badge={badge.id} data-earned={badge.earned ? "1" : "0"} data-revealed={badge.revealed ? "1" : "0"}>
      <span className={g.badgeIcon}>{badge.revealed ? <BadgeIcon icon={badge.icon} /> : <LockIcon />}</span>
      <span className={g.badgeName}>{badge.revealed ? t(`badges.${badge.id}.name` as never) : t("hidden.name")}</span>
      <span className={g.badgeDesc}>{badge.revealed ? t(`badges.${badge.id}.desc` as never) : t("hidden.desc")}</span>
      <span className={g.badgeMeta}>
        {badge.earned && badge.earnedOn
          ? badge.backfilled
            ? t("gallery.fromHistory")
            : t("gallery.earnedOn", { date: dateLabel(badge.earnedOn, locale) })
          : t("gallery.locked")}
      </span>
    </li>
  );
}
