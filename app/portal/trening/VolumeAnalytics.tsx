"use client";

// Analytika tréningu (náhľad odcvičeného vlastného plánu, feature/nahlad-analytika):
// karty cvikov vybraného tréningu pod sebou, v každej graf celkového objemu práce
// (opakovania × kg) v čase — zo všetkých tréningov klienta (getPlanVolumeProgress).

import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import type { PlanVolumeExercise } from "@/lib/dashboard/bodyMetrics";
import { PortalLineChart } from "../PortalLineChart";
import styles from "../portal.module.css";

export function VolumeAnalytics({
  exercises,
  error,
  onRetry,
}: {
  /** cviky vybraného tréningu; `null` = ešte sa načítava */
  exercises: PlanVolumeExercise[] | null;
  error: string | null;
  onRetry: () => void;
}) {
  const t = useTranslations("clientBuilder");
  const locale = useLocale() as Locale;
  const nf = useMemo(() => new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }), [locale]);

  if (error) {
    return (
      <div className={styles.vaState} role="alert">
        <p>{error}</p>
        <button type="button" className={styles.trGhostBtn} onClick={onRetry}>
          {t("volumeRetry")}
        </button>
      </div>
    );
  }
  if (!exercises) {
    return (
      <div className={styles.vaState} role="status" aria-busy="true">
        <span className={styles.vaSkeleton} aria-hidden="true" />
        <span className={styles.vaSkeleton} aria-hidden="true" />
        <span className={styles.srOnly}>{t("volumeLoading")}</span>
      </div>
    );
  }
  if (exercises.length === 0) return <p className={styles.trHint}>{t("volumeEmpty")}</p>;

  return (
    <div className={styles.vaList} data-testid="volume-analytics">
      <p className={styles.trHint}>{t("analyticsIntro")}</p>
      {exercises.map((ex) => (
        <article key={ex.entryId} className={styles.vaCard} data-testid="volume-card">
          <h3 className={styles.vaName}>{ex.name}</h3>
          {ex.points.length === 0 ? (
            <p className={styles.pgEmpty}>{t("volumeNoWeight")}</p>
          ) : (
            <PortalLineChart
              points={ex.points.map((p) => ({ date: p.date, value: p.volumeKg }))}
              unit="kg"
              label={ex.name}
              nf={nf}
              locale={locale}
              texts={{
                chartAria: t("volumeChartAria", { name: ex.name, count: ex.points.length }),
                single: t("volumeSingle"),
              }}
            />
          )}
        </article>
      ))}
    </div>
  );
}
