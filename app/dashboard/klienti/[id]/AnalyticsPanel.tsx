import Link from "next/link";
import type { NutritionAdherence, TrainingAdherence } from "@/lib/dashboard/adherence";
import type { BodyMetricEntry, StrengthPoint } from "@/lib/dashboard/bodyMetrics";
import { BodyMetricsCard } from "./BodyMetricsCard";
import { StrengthCard } from "./StrengthCard";
import { ProgressSummaryCard } from "./ProgressSummaryCard";
import styles from "../../dashboard.module.css";

/** Farba bodky v páse adherencie — 85–115 % cieľa = v poriadku, inak potrebuje pozornosť. */
function adherenceToneClass(pct: number | null): string {
  if (pct == null) return styles.adherenceNone;
  return pct >= 85 && pct <= 115 ? styles.adherenceGood : styles.adherenceOff;
}

interface NutritionGoal {
  calories_target: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

/**
 * Progres a analýza (feature/progress-analyst) — od feature/planing-groupMessage
 * je toto už vlastná sekcia v ClientDetailTabs (predtým schované za tlačidlom pod
 * menom klienta v jednom dlhom scrolle), netreba teda vlastný open/close toggle.
 */
export function AnalyticsPanel({
  clientId,
  nutrition,
  adherence,
  trainingAdherence,
  bodyMetrics,
  strengthNames,
  strengthByExercise,
}: {
  clientId: string;
  nutrition: NutritionGoal | null;
  adherence: NutritionAdherence | null;
  trainingAdherence: TrainingAdherence | null;
  bodyMetrics: BodyMetricEntry[];
  strengthNames: string[];
  strengthByExercise: Record<string, StrengthPoint[]>;
}) {
  return (
    <div className={styles.cardStack}>
      <ProgressSummaryCard clientId={clientId} />

      <div className={styles.card}>
        <h3>Analytika</h3>
        <h4 className={styles.cardSubhead}>Adherencia tréningu</h4>
        {trainingAdherence ? (
          <>
            <div className={styles.adherenceWindowRow}>
              <span>
                30 dní: <strong>{trainingAdherence.window30.pct}&nbsp;%</strong> ({trainingAdherence.window30.trainedDays}/
                {trainingAdherence.window30.totalDays} dní)
              </span>
              <span>
                90 dní: <strong>{trainingAdherence.window90.pct}&nbsp;%</strong> ({trainingAdherence.window90.trainedDays}/
                {trainingAdherence.window90.totalDays} dní)
              </span>
            </div>
            <p className={styles.adherenceHint}>% dní, kedy klient odcvičil aspoň jeden tréning (bez pevného rozvrhu).</p>
          </>
        ) : (
          <p className={styles.noWorkouts}>Adherenciu tréningu sa nepodarilo načítať.</p>
        )}

        <BodyMetricsCard entries={bodyMetrics} />

        <StrengthCard exerciseNames={strengthNames} byExercise={strengthByExercise} />
      </div>

      <div className={styles.card}>
        <h3>Trekovanie jedálnička</h3>
        {nutrition ? (
          <>
            <h4 className={styles.cardSubhead}>Makro cieľ</h4>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Kalorický cieľ</span>
              <span className={styles.infoValue}>{nutrition.calories_target} kcal/deň</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Makrá</span>
              <span className={styles.infoValue}>
                {nutrition.protein_g} g B · {nutrition.carbs_g} g S · {nutrition.fat_g} g T
              </span>
            </div>
            <Link href={`/dashboard/vyziva/${clientId}`} className={styles.backLink} style={{ marginTop: 8, marginBottom: 0 }}>
              Upraviť →
            </Link>

            {adherence?.hasGoal && (
              <>
                <h4 className={styles.cardSubhead}>Adherencia stravy</h4>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Dnes</span>
                  <span className={styles.infoValue}>
                    {adherence.todayKcal} / {adherence.kcalGoal} kcal · <strong>{adherence.todayPct}&nbsp;%</strong> z cieľa
                  </span>
                </div>
                <div className={styles.adherenceStrip} aria-hidden="true">
                  {adherence.days.map((day, i) => (
                    <div key={i} className={styles.adherenceDay}>
                      <span className={`${styles.adherenceDot} ${adherenceToneClass(day.pct)}`} />
                      <span className={styles.adherenceDayLabel}>{day.label}</span>
                    </div>
                  ))}
                </div>
                <p className={styles.adherenceHint}>Posledných 7 dní · zelená = 85–115 % cieľa, sivá = bez záznamu.</p>
                <div className={styles.adherenceWindowRow}>
                  <span>
                    30 dní: <strong>{adherence.window30.pct}&nbsp;%</strong>
                  </span>
                  <span>
                    90 dní: <strong>{adherence.window90.pct}&nbsp;%</strong>
                  </span>
                </div>
              </>
            )}
          </>
        ) : (
          <p className={styles.noWorkouts}>
            Makro cieľ zatiaľ nenastavený — <Link href={`/dashboard/vyziva/${clientId}`}>vypočítať teraz</Link>. Bez cieľa sa
            nedá počítať ani adherencia stravy.
          </p>
        )}
      </div>
    </div>
  );
}
