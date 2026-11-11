import { AppLink as Link } from "../../../components/AppLink";
import type { NutritionAdherence, TrainingAdherence } from "@/lib/dashboard/adherence";
import type { BodyMetricEntry, StrengthPoint, StrengthPR } from "@/lib/dashboard/bodyMetrics";
import { BodyMetricsCard } from "./BodyMetricsCard";
import { StrengthCard } from "./StrengthCard";
import { ProgressSummaryCard } from "./ProgressSummaryCard";
import { getTranslations } from "next-intl/server";
import { InfoTip } from "@/app/components/InfoTip";
import styles from "@/app/dashboard/dashboard.module.css";

/** Farba bodky v páse adherencie — 85–115 % cieľa = v poriadku, inak potrebuje pozornosť. */
function adherenceToneKey(pct: number | null): "adherenceNone" | "adherenceGood" | "adherenceOff" {
  if (pct == null) return "adherenceNone";
  return pct >= 85 && pct <= 115 ? "adherenceGood" : "adherenceOff";
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
export async function AnalyticsPanel({
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
  const t = await getTranslations("clientDetail.analytics");
  const b = { b: (chunks: React.ReactNode) => <strong>{chunks}</strong> };
  const planPct30 = trainingAdherence?.planCompletion.window30 ?? null;
  const nutritionPct30 = adherence?.hasGoal ? adherence.window30.pct : null;
  const wDelta = weightDelta90(bodyMetrics);

  // Kombinovaný súhrn (bod 4) — kľúčové čísla naraz, aby tréner vedel
  // diagnostikovať situáciu (tréning ide, strava nie, váha stojí…) bez skladania
  // čísel z troch kariet nižšie. Zobrazí sa len keď je aspoň jedno číslo dostupné.
  const summaryParts: { label: string; value: string }[] = [];
  if (trainingAdherence) summaryParts.push({ label: t("training"), value: `${trainingAdherence.window30.pct} %` });
  if (planPct30?.pct != null) summaryParts.push({ label: t("plan"), value: `${planPct30.pct} %` });
  if (nutritionPct30 != null) summaryParts.push({ label: t("nutrition"), value: `${nutritionPct30} %` });
  if (wDelta != null) summaryParts.push({ label: t("weight"), value: t("weightDelta", { delta: `${wDelta > 0 ? "+" : ""}${wDelta}` }) });

  return (
    <div className={styles.cardStack}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <a href={`/api/export/progress/${clientId}/pdf`} className="btn btn-ghost btn-sm">
          {t("downloadPdf")}
        </a>
        <a href={`/api/export/progress/${clientId}/csv`} className="btn btn-ghost btn-sm">
          {t("downloadCsv")}
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
        <h3>{t("title")}</h3>
        <h4 className={styles.cardSubhead}>
          {t("trainingAdherence")} <InfoTip title={t("trainingAdherence")}>{t("trainingAdherenceTip")}</InfoTip>
        </h4>
        {trainingAdherence ? (
          <>
            <div className={styles.adherenceWindowRow}>
              <span>
                {t.rich("windowDays", {
                  ...b,
                  window: 30,
                  pct: trainingAdherence.window30.pct,
                  done: trainingAdherence.window30.trainedDays,
                  total: trainingAdherence.window30.totalDays,
                })}
              </span>
              <span>
                {t.rich("windowDays", {
                  ...b,
                  window: 90,
                  pct: trainingAdherence.window90.pct,
                  done: trainingAdherence.window90.trainedDays,
                  total: trainingAdherence.window90.totalDays,
                })}
              </span>
            </div>
            <h4 className={styles.cardSubhead}>
              {t("planCompletion")} <InfoTip title={t("planCompletion")}>{t("planCompletionTip")}</InfoTip>
            </h4>
            {planPct30?.pct != null || trainingAdherence.planCompletion.window90.pct != null ? (
              <>
                <div className={styles.adherenceWindowRow}>
                  <span>
                    {t.rich("windowSessions", {
                      ...b,
                      window: 30,
                      pct: planPct30?.pct != null ? `${planPct30.pct} %` : "—",
                      count: planPct30?.sessionsScored ?? 0,
                    })}
                  </span>
                  <span>
                    {t.rich("windowSessions", {
                      ...b,
                      window: 90,
                      pct:
                        trainingAdherence.planCompletion.window90.pct != null
                          ? `${trainingAdherence.planCompletion.window90.pct} %`
                          : "—",
                      count: trainingAdherence.planCompletion.window90.sessionsScored,
                    })}
                  </span>
                </div>
              </>
            ) : (
              <p className={styles.adherenceHint}>
                {t("noPlanCompare")}
              </p>
            )}
          </>
        ) : (
          <p className={styles.noWorkouts}>{t("trainingFailed")}</p>
        )}

        <BodyMetricsCard entries={bodyMetrics} />

        <StrengthCard
          exerciseNames={strengthNames}
          byExercise={strengthByExercise}
          prExerciseNames={strengthPRs.map((p) => p.exercise)}
        />
      </div>

      <div className={styles.card}>
        <h3>{t("nutritionTitle")}</h3>
        {nutrition ? (
          <>
            <h4 className={styles.cardSubhead}>{t("macroGoal")}</h4>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>{t("calorieGoal")}</span>
              <span className={styles.infoValue}>{t("kcalPerDay", { kcal: nutrition.calories_target })}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>{t("macros")}</span>
              <span className={styles.infoValue}>
                {t("macroLine", { protein: nutrition.protein_g, carbs: nutrition.carbs_g, fat: nutrition.fat_g })}
              </span>
            </div>
            <Link href={`/dashboard/klienti/${clientId}?sekcia=jedalnicky`} className={styles.backLink} style={{ marginTop: 8, marginBottom: 0 }}>
              {t("edit")}
            </Link>

            {adherence?.hasGoal && (
              <>
                <h4 className={styles.cardSubhead}>{t("nutritionAdherence")}</h4>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>{t("today")}</span>
                  <span className={styles.infoValue}>
                    {t.rich("todayLine", { ...b, kcal: adherence.todayKcal ?? "—", goal: adherence.kcalGoal ?? "—", pct: adherence.todayPct ?? "—" })}
                  </span>
                </div>
                <div className={styles.adherenceStrip} aria-hidden="true">
                  {adherence.days.map((day, i) => (
                    <div key={i} className={styles.adherenceDay}>
                      <span className={`${styles.adherenceDot} ${styles[adherenceToneKey(day.pct)]}`} />
                      <span className={styles.adherenceDayLabel}>{day.label}</span>
                    </div>
                  ))}
                </div>
                <p className={styles.adherenceHint}>{t("last7Hint")}</p>
                <div className={styles.adherenceWindowRow}>
                  <span>{t.rich("windowPct", { ...b, window: 30, pct: `${adherence.window30.pct} %` })}</span>
                  <span>{t.rich("windowPct", { ...b, window: 90, pct: `${adherence.window90.pct} %` })}</span>
                </div>
              </>
            )}
          </>
        ) : (
          <p className={styles.noWorkouts}>
            {t.rich("noGoal", {
              link: (chunks) => <Link href={`/dashboard/klienti/${clientId}?sekcia=jedalnicky`}>{chunks}</Link>,
            })}
          </p>
        )}
      </div>
    </div>
  );
}
