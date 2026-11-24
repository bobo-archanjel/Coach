"use client";

// Vyhodnotenie celého odcvičeného vlastného plánu (Náhľad v Tréningu, feature/nahlad-analytika).
// Dáta: lib/portal/planReview.ts. Časti sa skladajú v ClientPlanBuilder (readOnly):
// ReviewOverview hore (súhrn, úspechy, zistenia), DayReview pod dráhou tréningov
// (karty cvikov), ReviewTimeline dole (ako sa cvičilo).

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import { formatCompletedDate, type CompareExercise, type CompletedCompare } from "@/lib/workouts/completed";
import { DEFAULT_PROGRESSION, PROGRESSION_OPTIONS, progressLoad, type PlanReview, type ReviewInsight } from "@/lib/portal/planReview";
import { BuilderDialog } from "@/app/components/BuilderDialog";
import { CompletedExercises } from "@/app/components/CompletedExercises";
import { DumbbellIcon, GaugeIcon, LayersIcon, Stat, WeightIcon } from "../DoneWorkoutView";
import { PortalLineChart } from "../PortalLineChart";
import styles from "../portal.module.css";

const TrophyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
    <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </svg>
);
const BulbIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Kto sa pozerá: klient (Tréning v portáli, „tvoje“) alebo tréner (detail plánu, „klient“). */
export type ReviewVoice = "client" | "trainer";
function useReviewT(voice: ReviewVoice = "client") {
  const client = useTranslations("clientBuilder");
  const trainer = useTranslations("plans.review");
  return voice === "trainer" ? trainer : client;
}

function useFormat() {
  const locale = useLocale() as Locale;
  const nf = useMemo(() => new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }), [locale]);
  const shortDate = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" });
  return { locale, nf, shortDate };
}

/** Súhrn plánu, úspechy a zistenia — pod názvom plánu. */
export function ReviewOverview({
  review,
  error = null,
  onRetry,
  voice = "client",
}: {
  /** `null` = ešte sa načítava */
  review: PlanReview | null;
  error?: string | null;
  onRetry?: () => void;
  voice?: ReviewVoice;
}) {
  const t = useReviewT(voice);
  const { nf, shortDate } = useFormat();

  if (error) {
    return (
      <div className={styles.rvState} role="alert">
        <p>{error}</p>
        {onRetry && (
          <button type="button" className={styles.trGhostBtn} onClick={onRetry}>
            {t("reviewRetry")}
          </button>
        )}
      </div>
    );
  }
  if (!review) {
    return (
      <div className={styles.rvState} role="status" aria-busy="true">
        <span className={styles.rvSkeleton} aria-hidden="true" />
        <span className={styles.srOnly}>{t("reviewLoading")}</span>
      </div>
    );
  }

  const completion = review.plannedSets > 0 ? Math.round((review.plannedSetsDone / review.plannedSets) * 100) : null;
  const insightText = (i: ReviewInsight) =>
    i.kind === "progress"
      ? t("insightProgress", { name: i.name, kg: nf.format(i.kg) })
      : i.kind === "moreReps"
        ? t("insightMoreReps", { name: i.name })
        : i.kind === "fewerSets"
          ? t("insightFewerSets", { name: i.name, done: i.done, planned: i.planned })
          : t("insightSkipped", { name: i.name, times: i.times });

  return (
    <div className={styles.rvOverview} data-testid="plan-review">
      {review.from && review.to && (
        <p className={styles.rvPeriod}>
          {review.from === review.to ? shortDate(review.from) : t("reviewPeriod", { from: shortDate(review.from), to: shortDate(review.to) })}
        </p>
      )}
      <div className={styles.doneStats} data-testid="review-stats">
        <Stat icon={<DumbbellIcon />} label={t("statWorkouts")} value={String(review.workouts)} />
        <Stat
          icon={<LayersIcon />}
          label={t("statPlannedSets")}
          value={completion != null ? `${review.plannedSetsDone}/${review.plannedSets} · ${completion} %` : String(review.sets)}
        />
        {review.volumeKg > 0 && <Stat icon={<WeightIcon />} label={t("statVolume")} value={`${nf.format(review.volumeKg)} kg`} />}
        {review.avgRpe != null && <Stat icon={<GaugeIcon />} label={t("statRpe")} value={`${nf.format(review.avgRpe)}/10`} />}
      </div>

      {review.records.length > 0 && (
        <section className={styles.rvBox} aria-labelledby="rv-records">
          <h3 id="rv-records" className={styles.rvBoxTitle}>
            <span className={styles.rvBoxIcon}>
              <TrophyIcon />
            </span>
            {t("recordsTitle")}
          </h3>
          <ul className={styles.rvList} data-testid="review-records">
            {review.records.map((r) => (
              <li key={r.name}>
                <strong>{t("recordLine", { name: r.name, kg: nf.format(r.kg), reps: r.reps })}</strong>
                <span className={styles.rvSub}>
                  {t("recordGain", { kg: nf.format(r.kg - r.prevKg) })} · {shortDate(r.date)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {review.insights.length > 0 && (
        <section className={styles.rvBox} aria-labelledby="rv-insights">
          <h3 id="rv-insights" className={styles.rvBoxTitle}>
            <span className={styles.rvBoxIcon}>
              <BulbIcon />
            </span>
            {t("insightsTitle")}
          </h3>
          <ul className={styles.rvList} data-testid="review-insights">
            {review.insights.map((i) => (
              <li key={`${i.kind}-${i.name}`} data-kind={i.kind}>
                {insightText(i)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Karty cvikov vybraného tréningu: graf najťažšej série, objem posledného tréningu, detail sérií. */
export function DayReview({
  compare,
  review,
  voice = "client",
}: {
  compare: CompletedCompare | null;
  review: PlanReview | null;
  /** tréner (náhľad plánu) — texty o klientovi, nie „spravíš“ */
  voice?: ReviewVoice;
}) {
  const t = useTranslations("clientBuilder");
  if (!compare || compare.exercises.length === 0) return <p className={styles.trHint}>{t("dayNoValues")}</p>;
  return (
    <div className={styles.rvCards}>
      {compare.exercises.map((ex) => (
        <ExerciseReviewCard key={ex.key} ex={ex} hasPlan={compare.hasPlan} review={review} voice={voice} />
      ))}
    </div>
  );
}

function ExerciseReviewCard({
  ex,
  hasPlan,
  review,
  voice,
}: {
  ex: CompareExercise;
  hasPlan: boolean;
  review: PlanReview | null;
  voice: ReviewVoice;
}) {
  const t = useTranslations("clientBuilder");
  const tv = useReviewT(voice);
  const { locale, nf } = useFormat();
  const [open, setOpen] = useState(false);
  const name = review?.names[ex.planned?.entryId ?? ex.key] ?? ex.name;
  const points = review?.series[name] ?? [];
  const isRecord = review?.records.some((r) => r.name === name) ?? false;
  const actual = ex.rows.flatMap((r) => (r.actual ? [r.actual] : []));
  const lastVolume = actual.reduce((sum, s) => sum + (s.reps != null && s.weight != null ? s.reps * s.weight : 0), 0);
  const weighted = actual.some((s) => s.weight != null);
  const bestReps = Math.max(0, ...actual.map((s) => s.reps ?? 0));

  return (
    <article className={styles.rvCard} data-testid="review-card">
      <div className={styles.rvCardHead}>
        <h3 className={styles.rvCardName}>{name}</h3>
        {isRecord && <span className={styles.rvChipRecord}>{t("recordChip")}</span>}
        {ex.status === "skipped" && <span className={styles.chip}>{t("skippedChip")}</span>}
      </div>

      {ex.status !== "skipped" &&
        (weighted && points.length > 0 ? (
          <>
            <p className={styles.rvLabel}>{t("bestSet")}</p>
            <PortalLineChart
              points={points.map((p) => ({ date: p.date, value: p.bestKg, note: p.reps ? t("repsNote", { reps: p.reps }) : undefined }))}
              unit="kg"
              label={name}
              nf={nf}
              locale={locale}
              texts={{ chartAria: t("chartAria", { name, count: points.length }), single: tv("chartSingle") }}
            />
            {lastVolume > 0 && <p className={styles.rvSub}>{t("lastVolume", { kg: nf.format(Math.round(lastVolume)) })}</p>}
          </>
        ) : (
          <p className={styles.rvSub}>{bestReps > 0 ? t("noWeight", { reps: bestReps }) : t("noWeightNoReps")}</p>
        ))}

      <button type="button" className={styles.rvToggle} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? t("hideSets") : t("showSets")}
      </button>
      {open && <CompletedExercises exercises={[ex]} hasPlan={hasPlan} />}
    </article>
  );
}

/** Ako sa cvičilo — dátum, tréning, náročnosť a poznámka každého tréningu plánu. */
export function ReviewTimeline({ review, voice = "client" }: { review: PlanReview | null; voice?: ReviewVoice }) {
  const t = useReviewT(voice);
  const locale = useLocale() as Locale;
  if (!review || review.timeline.length === 0) return null;
  return (
    <section className={styles.rvBox} aria-labelledby="rv-timeline">
      <h3 id="rv-timeline" className={styles.rvBoxTitle}>
        {t("timelineTitle")}
      </h3>
      <ol className={styles.rvTimeline} data-testid="review-timeline">
        {review.timeline.map((w, i) => (
          <li key={`${w.date}-${w.dayId}-${i}`}>
            <span className={styles.rvTimeDate}>{formatCompletedDate(`${w.date}T12:00:00Z`, locale)}</span>
            <span className={styles.rvTimeBody}>
              <strong>{w.dayName}</strong>
              {w.rpe != null && <span className={styles.rvSub}> · {t("timelineRpe", { rpe: w.rpe })}</span>}
              {w.note && <span className={styles.rvNote}>„{w.note}“</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Deň plánu pre okno progresie — z portálu (PortalPlan) aj z trénerovho detailu plánu. */
export interface ProgressionDay {
  id: string;
  name: string;
  exercises: { entryId: string | null; name: string; loadKg: number | null }[];
}

/**
 * „Zopakovať s progresiou“: zvolí sa, o koľko % zvýšiť záťaž, a hneď je vidieť, čo sa pri
 * ktorom cviku zmení. Zvyšujú sa len cviky so všetkými splnenými sériami (`ready`),
 * ostatné ostávajú. Potvrdenie odovzdá zvolené % — klient dostane builder nového plánu,
 * tréner nový koncept plánu pre klienta (createProgressedPlanAction).
 */
export function ProgressionDialog({
  days,
  ready,
  onCreate,
  onClose,
  pending = false,
  error = null,
  voice = "client",
}: {
  days: ProgressionDay[];
  ready: Record<string, number>;
  onCreate: (pct: number) => void;
  onClose: () => void;
  pending?: boolean;
  error?: string | null;
  voice?: ReviewVoice;
}) {
  const t = useReviewT(voice);
  const { nf } = useFormat();
  const [pct, setPct] = useState<number>(DEFAULT_PROGRESSION);

  // cviky zoskupené podľa tréningov (názov tréningu raz ako nadpis, nie pri každom cviku)
  const groups = days
    .map((d) => ({
      id: d.id,
      name: d.name,
      rows: d.exercises.map((e, i) => {
        const base = e.entryId ? ready[e.entryId] : undefined;
        return {
          key: `${d.id}:${e.entryId ?? i}`,
          name: e.name,
          load: e.loadKg,
          from: base ?? null,
          to: base != null ? progressLoad(base, pct) : null,
        };
      }),
    }))
    .filter((g) => g.rows.length > 0);
  const anyReady = groups.some((g) => g.rows.some((r) => r.to != null));

  return (
    <BuilderDialog title={t("progressionTitle")} closeLabel={t("progressionClose")} onClose={onClose}>
      <div className={styles.pgdBody} data-testid="progression-dialog">
        <p className={styles.trHint}>{t("progressionIntro")}</p>
        <div className={styles.pgdOptions} role="radiogroup" aria-label={t("progressionAria")}>
          {PROGRESSION_OPTIONS.map((o) => (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={pct === o}
              className={styles.pgdOption}
              onClick={() => setPct(o)}
            >
              {t("progressionOption", { pct: nf.format(o) })}
            </button>
          ))}
        </div>

        <p className={styles.rvLabel}>{t("progressionChanges")}</p>
        {!anyReady && <p className={styles.rvSub}>{t("progressionNone")}</p>}
        <div className={styles.pgdScroll} data-testid="progression-changes">
          {groups.map((g) => (
            <div key={g.id} className={styles.pgdGroup}>
              <p className={styles.pgdDay}>{g.name}</p>
              <ul className={styles.pgdList}>
                {g.rows.map((r) => (
                  <li key={r.key} data-up={r.to != null || undefined}>
                    <span className={styles.pgdName}>{r.name}</span>
                    <span className={styles.pgdValue}>
                      {r.from != null && r.to != null
                        ? t("progressionUp", { from: nf.format(r.from), to: nf.format(r.to) })
                        : r.load != null
                          ? t("progressionKeep", { kg: nf.format(r.load) })
                          : t("progressionNoLoad")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {error && (
          <p className={styles.trError} role="alert">
            {error}
          </p>
        )}
        <div className={styles.pgdActions}>
          <button type="button" className={styles.trGhostBtn} onClick={onClose} disabled={pending}>
            {t("progressionCancel")}
          </button>
          <button type="button" className={styles.trSaveBtn} onClick={() => onCreate(pct)} disabled={pending}>
            {pending ? t("progressionCreating") : t("progressionCreate")}
          </button>
        </div>
      </div>
    </BuilderDialog>
  );
}
