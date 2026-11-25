import { getTranslations } from "next-intl/server";
import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { createClient, getMyClient, getUser } from "@/lib/supabase/server";
import { getUserLocale } from "@/lib/i18n/server";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import { BADGE_CATEGORIES, badgeById, canonicalBadgeId, displayAmount, type BadgeView } from "@/lib/gamification/badges";
import { loadGalleryData, type GalleryData } from "@/lib/gamification/server";
import { loadCosmetics } from "@/lib/gamification/cosmeticsServer";
import { MAX_STORED_FREEZES, nextReward } from "@/lib/gamification/rewards";
import { loadBrandingForTrainer } from "@/lib/branding/server";
import { todayIso } from "@/lib/reports/period";
import { BadgeIcon, LockIcon } from "@/app/components/BadgeIcon";
import { Suspense, type ReactNode } from "react";
import { ChallengesHost } from "../ChallengesCard";
import { LeaderboardHost } from "../LeaderboardHost";
import { MissionsHost } from "../MissionsHost";
import { RewardsCard } from "../RewardsCard";
import { WeeklySummaryHost } from "../WeeklySummaryHost";
import g from "@/app/components/gamification.module.css";
import g2 from "@/app/components/gamificationV2.module.css";
import s from "../portal.module.css";

/* /portal/uspechy — misie týždňa, úroveň s titulom a odmenami, galéria odznakov so stupňami (bronz / striebro / zlato)
   a postupom, zoznam rekordov a posledné úspechy. Dáta: lib/gamification/server.ts. Pri prvom zobrazení klienta
   s históriou sa spätne dopočítajú odznaky a rekordy — ticho, bez oslavy. */

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
  const cosmetics = await loadCosmetics(user.id);
  const branded = client ? Boolean(await loadBrandingForTrainer(client.trainer_id ?? null)) : false;
  const initial = ((client?.full_name as string | undefined) ?? "").trim().charAt(0).toUpperCase() || "?";

  return (
    <>
      <header>
        <h1 className={s.pageTitle}>{t("title")}</h1>
        <p className={s.pageSub}>{t("subtitle")}</p>
      </header>
      {data ? (
        <Gallery
          data={data}
          locale={locale}
          cosmetics={cosmetics}
          branded={branded}
          initial={initial}
          lead={
            <>
              <Suspense fallback={null}>
                <MissionsHost />
              </Suspense>
              <Suspense fallback={null}>
                <WeeklySummaryHost mode="always" />
              </Suspense>
              <Suspense fallback={null}>
                <ChallengesHost />
              </Suspense>
              <Suspense fallback={null}>
                <LeaderboardHost />
              </Suspense>
            </>
          }
        />
      ) : (
        <p className={g.empty}>{t("unavailable")}</p>
      )}
    </>
  );
}

async function Gallery({
  data,
  locale,
  cosmetics,
  branded,
  initial,
  lead,
}: {
  /** misie, týždenný súhrn, výzvy a rebríček — hneď pod úrovňou a „Čo ťa čaká“ */
  lead: ReactNode;
  data: GalleryData;
  locale: Locale;
  cosmetics: import("@/lib/gamification/cosmeticsServer").Cosmetics;
  branded: boolean;
  initial: string;
}) {
  const t = await getTranslations("gamification");
  const { detail, xp } = data;
  const percent = Math.round(detail.fraction * 100);
  const earnedCount = data.badges.filter((b) => b.earned).length;
  const byCategory = (cat: string) => data.badges.filter((b) => b.category === cat);
  const title = t(`levelTitles.${detail.n}` as never);

  // text najbližšej odmeny: „rámik Žeravý, zmrazenie série 🧊“
  const nr = nextReward(detail.n, branded);
  const nextRewardText = nr
    ? t("rewards.next", {
        level: nr.level,
        text: [
          ...nr.rewards.frames.map((f) => t("rewards.item.frame", { name: t(`frames.${f}` as never) })),
          ...nr.rewards.themes.map((th) => t("rewards.item.theme", { name: t(`themes.${th}` as never) })),
          ...nr.rewards.celebrations.map((c) => t("rewards.item.celebration", { name: t(`celebrations.${c}` as never) })),
          ...(nr.rewards.titles.length > 0 ? [t("rewards.item.title", { name: t(`levelTitles.${nr.rewards.titles[nr.rewards.titles.length - 1]}` as never) })] : []),
          ...Array.from({ length: nr.rewards.freezes }, () => t("rewards.item.freeze")),
        ].join(", "),
      })
    : null;
  const freezeUses = data.freezes.uses.map((u) =>
    u.kind === "week" ? t("freeze.usedWeek", { date: dateLabel(u.unit, locale) }) : t("freeze.usedDay", { date: dateLabel(u.unit, locale) }),
  );

  return (
    <div className={g.stack}>
      <section className={`${g.card} ${g.levelCard}`} aria-label={t("levelDetail.detail", { n: detail.n, title })} data-testid="level-card">
        <div className={g.levelHead}>
          <span className={g.levelName}>{t("levelDetail.detail", { n: detail.n, title })}</span>
          <span className={g.levelXp}>{t("level.xp", { xp: detail.xp })}</span>
        </div>
        <p className={g2.titleLine}>{t("levelDetail.groupLine", { group: t(`levels.${detail.group}` as never) })}</p>
        <div
          className={g.bar}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={detail.nextN ? t("level.progressAria", { next: t(`levelTitles.${detail.nextN}` as never), percent }) : t("level.maxAria")}
        >
          <span className={g.barFill} style={{ "--p": percent / 100 } as CSSProperties} />
        </div>
        <p className={g.levelFoot}>
          {detail.nextN != null && detail.toNext != null ? t("levelDetail.toNext", { count: detail.toNext, n: detail.nextN }) : t("level.max")}
        </p>
        <details className={g.xpDetails}>
          <summary>{t("xpBreakdown.title")}</summary>
        <ul className={g.xpList}>
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
          {xp.missions > 0 && (
            <li>
              <span>{t("xpBreakdown.missions")}</span>
              <span>{xp.missions}</span>
            </li>
          )}
          {xp.rings > 0 && (
            <li>
              <span>{t("xpBreakdown.rings")}</span>
              <span>{xp.rings}</span>
            </li>
          )}
        </ul>
        </details>
      </section>

      {data.next.length > 0 && (
        <section className={g.card} aria-label={t("next.title")} data-testid="next-badges">
          <h2 className={g.cardTitle}>{t("next.title")}</h2>
          <div className={g2.nextBox}>
            {data.next.map((n) => (
              <div key={n.id} className={g2.nextItem}>
                <p className={g2.nextLine}>
                  {t("next.line", {
                    amount: t(`next.units.${n.unit}` as never, { count: displayAmount(n.unit, n.remaining) } as never),
                    name: t(`badges.${n.id}.name` as never),
                  })}
                </p>
                <div className={g.badgeBar} aria-hidden="true">
                  <span className={g.badgeBarFill} style={{ width: `${Math.round(n.fraction * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {lead}

      <RewardsCard
        level={detail.n}
        frame={cosmetics.frame}
        theme={cosmetics.theme}
        celebration={cosmetics.celebration}
        titleLevel={cosmetics.titleLevel}
        flameHot={cosmetics.flameHot}
        branded={branded}
        initial={initial}
        freezeUses={freezeUses}
        freezeAvailable={data.freezes.available}
        freezeMax={MAX_STORED_FREEZES}
        nextRewardText={nextRewardText}
      />

      {data.recent.length > 0 && (
        <section className={g.card}>
          <h2 className={g.cardTitle}>{t("recent.title")}</h2>
          <ul className={g.recentList}>
            {data.recent.map((r) => (
              <li key={r.id} className={g.recentRow}>
                <span>
                  {r.kind === "pr" && r.exerciseName && r.value != null
                    ? t("recent.pr", { exercise: r.exerciseName, weight: r.value })
                    : r.kind === "level" && r.level != null
                      ? t("recent.level", { n: r.level, title: t(`levelTitles.${r.level}` as never) })
                      : r.kind === "challenge" && r.challengeName
                        ? t("recent.challenge", { name: r.challengeName })
                        : r.badgeId && badgeById(canonicalBadgeId(r.badgeId))
                          ? t("recent.badge", { name: t(`badges.${canonicalBadgeId(r.badgeId)}.name` as never) })
                          : null}
                </span>
                <span className={g.shareRow}>
                  {r.highFived && <span className={g.hf}>🙌 {t("recent.highFive")}</span>}
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
                <span className={g.recordVal}>{t("records.best", { weight: r.bestWeightKg, reps: r.bestWeightReps })}</span>
                <span className={g.recordSub}>
                  {r.bestE1rm != null ? `${t("records.e1rm", { value: r.bestE1rm })} · ` : ""}
                  {t("records.last", { date: dateLabel(r.lastOn, locale) })}
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

const TIER_RING = { bronze: g2.ringBronze, silver: g2.ringSilver, gold: g2.ringGold } as const;
const TIER_PILL = { bronze: g2.tierBronze, silver: g2.tierSilver, gold: g2.tierGold } as const;

async function BadgeCard({ badge, locale }: { badge: BadgeView & { backfilled: boolean }; locale: Locale }) {
  const t = await getTranslations("gamification");
  const cls = `${g.badge} ${badge.earned ? g.badgeEarned : g.badgeLocked}`;
  const prog = badge.progress;
  const inTons = prog?.unit === "tons";
  const val = prog ? (inTons ? displayAmount("tons", prog.value) : prog.value) : 0;
  const goal = prog ? (inTons ? displayAmount("tons", prog.goal) : prog.goal) : 0;
  return (
    <li className={cls} data-badge={badge.id} data-earned={badge.earned ? "1" : "0"} data-revealed={badge.revealed ? "1" : "0"} data-tier={badge.tier ?? undefined}>
      <span className={g2.badgeHead}>
      <span className={`${g.badgeIcon} ${badge.tier && badge.revealed ? TIER_RING[badge.tier] : ""}`}>{badge.revealed ? <BadgeIcon icon={badge.icon} /> : <LockIcon />}</span>
      <span className={g2.badgePills}>
        {badge.tier && <span className={`${g2.tierPill} ${TIER_PILL[badge.tier]}`}>{t(`tiers.${badge.tier}`)}</span>}
        {badge.revealed && !badge.tier && badge.rarity !== "common" && (
          <span className={`${g2.rarityPill} ${badge.rarity === "epic" ? g2.rarityEpic : badge.rarity === "rare" ? g2.rarityRare : ""}`}>{t(`rarity.${badge.rarity}`)}</span>
        )}
      </span>
      </span>
      <span className={g.badgeName}>{badge.revealed ? t(`badges.${badge.id}.name` as never) : t("hidden.name")}</span>
      <span className={g.badgeDesc}>{badge.revealed ? t(`badges.${badge.id}.desc` as never) : t("hidden.desc")}</span>
      {prog && !badge.earned && (
        <span className={g2.badgeProgress} data-testid="badge-progress">
          <span className={g.badgeBar} aria-hidden="true">
            <span className={g.badgeBarFill} style={{ width: `${Math.round((prog.value / Math.max(1, prog.goal)) * 100)}%` }} />
          </span>
          <span className={g2.badgeProgressText}>{inTons ? t("next.progressTons", { value: val, goal }) : t("next.progress", { value: val, goal })}</span>
        </span>
      )}
      <span className={g.badgeMeta}>
        {badge.earned && badge.earnedOn
          ? badge.backfilled
            ? t("gallery.fromHistory")
            : t("gallery.earnedOn", { date: dateLabel(badge.earnedOn, locale) })
          : prog
            ? null
            : t("gallery.locked")}
      </span>
    </li>
  );
}
