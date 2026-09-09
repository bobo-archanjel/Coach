import Link from "next/link";
import type { NutritionAdherence, TrainingAdherence } from "@/lib/dashboard/adherence";
import type { BodyMetricEntry, StrengthPoint, StrengthPR } from "@/lib/dashboard/bodyMetrics";
import { BodyMetricsCard } from "./BodyMetricsCard";
import { StrengthCard } from "./StrengthCard";
import { ProgressSummaryCard } from "./ProgressSummaryCard";
import styles from "../../dashboard.module.css";

/** Farba bodky v páse adherencie — 85–115 % cieľa = v poriadku, inak potrebuje pozornosť. */
function adherenceToneClass(pct: number | null): string {
  if (pct == null) return styles.adherenceNone;
  return pct >= 85 && pct <= 115 ? styles.adherenceGood : styles.adherenceOff;
}

/** Zmena váhy za posledných ~90 dní z histórie meraní (posledné − prvé v okne), null bez ≥2 meraní. */
function weightDelta90(entries: BodyMetricEntry[]): number | null {
  const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const withWeight = entries.filter((e) => e.weightKg != null && e.measuredOn >= cutoff);
  if (withWeight.length < 2) return null;
  const first = withWeight[0].weightKg as number;
  const last = withWeight[withWeight.length - 1].weightKg as number;
  return Math.round((last - first) * 10) / 10;
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
  strengthPRs = [],
}: {
  clientId: string;
  nutrition: NutritionGoal | null;
  adherence: NutritionAdherence | null;
  trainingAdherence: TrainingAdherence | null;
  bodyMetrics: BodyMetricEntry[];
  strengthNames: string[];
  strengthByExercise: Record<string, StrengthPoint[]>;
  strengthPRs?: StrengthPR[];
}) {
  const planPct30 = trainingAdherence?.planCompletion.window30 ?? null;
  const nutritionPct30 = adherence?.hasGoal ? adherence.window30.pct : null;
  const wDelta = weightDelta90(bodyMetrics);

  // Kombinovaný súhrn (bod 4) — kľúčové čísla naraz, aby tréner vedel
  // diagnostikovať situáciu (tréning ide, strava nie, váha stojí…) bez skladania
  // čísel z troch kariet nižšie. Zobrazí sa len keď je aspoň jedno číslo dostupné.
  const summaryParts: { label: string; value: string }[] = [];
  if (trainingAdherence) summaryParts.push({ label: "Tréning", value: `${trainingAdherence.window30.pct} %` });
  if (planPct30?.pct != null) summaryParts.push({ label: "Plán", value: `${planPct30.pct} %` });
  if (nutritionPct30 != null) summaryParts.push({ label: "Strava", value: `${nutritionPct30} %` });
  if (wDelta != null) summaryParts.push({ label: "Váha", value: `${wDelta > 0 ? "+" : ""}${wDelta} kg (90 dní)` });

  return (
    <div className={styles.cardStack}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <a href={`/api/export/progress/${clientId}/pdf`} className="btn btn-ghost btn-sm">
          Stiahnuť PDF
        </a>
        <a href={`/api/export/progress/${clientId}/csv`} className="btn btn-ghost btn-sm">
          Stiahnuť CSV (merania)
        </a>
      </div>

      {summaryParts.length > 0 && (
        <div className={styles.combinedSummary}>
          {summaryParts.map((p, i) => (
            <span key={i}>
              {p.label} <strong>{p.value}</strong>
            </span>
          ))}
        </div>
      )}

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

            <h4 className={styles.cardSubhead}>Splnenie plánu</h4>
            {planPct30?.pct != null || trainingAdherence.planCompletion.window90.pct != null ? (
              <>
                <div className={styles.adherenceWindowRow}>
                  <span>
                    30 dní: <strong>{planPct30?.pct != null ? `${planPct30.pct} %` : "—"}</strong> (
                    {planPct30?.sessionsScored ?? 0} tréningov)
                  </span>
                  <span>
                    90 dní:{" "}
                    <strong>
                      {trainingAdherence.planCompletion.window90.pct != null
                        ? `${trainingAdherence.planCompletion.window90.pct} %`
                        : "—"}
                    </strong>{" "}
                    ({trainingAdherence.planCompletion.window90.sessionsScored} tréningov)
                  </span>
                </div>
                <p className={styles.adherenceHint}>
                  Nakoľko sa odcvičené série/opakovania/váha zhodujú s predpisom z plánu (prekročenie sa počíta ako 100 %).
                </p>
              </>
            ) : (
              <p className={styles.adherenceHint}>
                Zatiaľ žiadny odcvičený tréning s naviazaným plánovaným dňom — nedá sa porovnať s predpisom.
              </p>
            )}
          </>
        ) : (
          <p className={styles.noWorkouts}>Adherenciu tréningu sa nepodarilo načítať.</p>
        )}

        <BodyMetricsCard entries={bodyMetrics} />

        <StrengthCard
          exerciseNames={strengthNames}
          byExercise={strengthByExercise}
          prExerciseNames={strengthPRs.map((p) => p.exercise)}
        />
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
