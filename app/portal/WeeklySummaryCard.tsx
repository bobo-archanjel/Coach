"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ShareButton } from "@/app/components/ShareButton";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import type { WeeklySummary } from "@/lib/gamification/weekly";
import { markWeeklySummarySeenAction } from "./gamificationActions";
import g from "@/app/components/gamification.module.css";

/* „Tvoj týždeň“ — pozitívny súhrn uplynulého týždňa (tréningy voči cieľu, prstence, rekordy,
   odznaky, objem proti predchádzajúcemu týždňu, séria). Na karte Dnes sa ukáže raz za týždeň
   (zatvorením sa označí ako videný); na stránke Úspechy je bez zatvorenia. */

export function WeeklySummaryCard({ summary, dismissible = true }: { summary: WeeklySummary; dismissible?: boolean }) {
  const t = useTranslations("gamification.weekly");
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState(true);
  if (!open) return null;

  const fmt = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "numeric", timeZone: "UTC" });
  const nf = new Intl.NumberFormat(intlLocale(locale));
  const rings = Object.fromEntries(summary.rings.map((r) => [r.id, r]));
  const vol = summary.volume;
  const earned = summary.badgeIds.length + summary.challengeNames.length;

  return (
    <section className={g.wkCard} aria-label={t("title")} data-testid="weekly-summary" data-week={summary.weekStart}>
      <div className={g.wkHead}>
        <div>
          <h2 className={g.wkTitle}>{t("title")}</h2>
          <p className={g.wkRange}>{t("range", { from: fmt(summary.weekStart), to: fmt(summary.weekEnd) })}</p>
        </div>
        {dismissible && (
          <button
            type="button"
            className={g.wkClose}
            onClick={() => {
              setOpen(false);
              void markWeeklySummarySeenAction(summary.weekStart);
            }}
          >
            {t("close")}
          </button>
        )}
      </div>

      <p className={g.wkNote}>{summary.workouts.met ? t("goalMet") : t("goalProgress", { done: summary.workouts.done, target: summary.workouts.target })}</p>

      <ul className={g.wkGrid}>
        <li className={g.wkTile}>
          <span className={g.wkNum}>
            {summary.workouts.done}/{summary.workouts.target}
          </span>
          <span className={g.wkLab}>{t("workouts")}</span>
        </li>
        {rings.food && (
          <li className={g.wkTile}>
            <span className={g.wkNum}>
              {rings.food.value}/{rings.food.goal}
            </span>
            <span className={g.wkLab}>{t("foodDays")}</span>
          </li>
        )}
        {rings.protein && (
          <li className={g.wkTile}>
            <span className={g.wkNum}>
              {rings.protein.value}/{rings.protein.goal}
            </span>
            <span className={g.wkLab}>{t("proteinDays")}</span>
          </li>
        )}
        <li className={g.wkTile}>
          <span className={g.wkNum}>{summary.prs.count}</span>
          <span className={g.wkLab}>{t("prs")}</span>
        </li>
        {earned > 0 && (
          <li className={g.wkTile}>
            <span className={g.wkNum}>{earned}</span>
            <span className={g.wkLab}>{t("badges")}</span>
          </li>
        )}
        {vol.thisKg > 0 && (
          <li className={g.wkTile}>
            <span className={g.wkNum}>{nf.format(vol.thisKg)} kg</span>
            <span className={g.wkLab}>
              {vol.trend === "up" && vol.deltaPct != null
                ? t("volumeUp", { pct: vol.deltaPct })
                : vol.prevKg > 0
                  ? t("volumePrev", { kg: nf.format(vol.prevKg) })
                  : t("volume")}
            </span>
          </li>
        )}
        {summary.streakWeeks >= 2 && (
          <li className={g.wkTile}>
            <span className={g.wkNum}>{summary.streakWeeks}</span>
            <span className={g.wkLab}>{t("streak")}</span>
          </li>
        )}
      </ul>

      {summary.prs.top.length > 0 && (
        <p className={g.wkNote}>{t("topPrs", { list: summary.prs.top.map((p) => `${p.exerciseName} ${p.weightKg} kg`).join(", ") })}</p>
      )}

      <div className={g.wkActions}>
        <ShareButton href={`/api/gamification/share?w=${summary.weekStart}`} fileName="fitpilot-tyzden.png" />
      </div>
    </section>
  );
}
