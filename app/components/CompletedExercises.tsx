import { useLocale, useTranslations } from "next-intl";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import {
  formatDistance,
  formatDuration,
  rowTone,
  setTones,
  type CompareExercise,
  type CompareRow,
  type SetTone,
  type SnapshotExercise,
} from "@/lib/workouts/completed";
import { timedSeconds } from "@/lib/workouts/timedReps";
import { supersetPositions } from "@/lib/workouts/superset";
import styles from "./completedExercises.module.css";

/*
 * Odcvičený tréning: plán vs. skutočnosť po sériách (lib/workouts/completed.ts —
 * comparePlanWithActual). Zdieľajú ho builder trénera (odcvičený deň plánu)
 * aj portál klienta (Tréning → deň Hotovo, karta Dnes po odcvičení, náhľad dňa v Tento týždeň).
 * Bez "use client" — useTranslations funguje v server aj client komponentoch.
 *
 * `hasPlan` false = záznam bez plan_snapshot (spred 0048) — len odcvičené série, bez stĺpca Plán.
 * `flat` = bez rámu okolo cvikov (vnútri karty v portáli), cviky oddelené čiarou.
 */

type CompareT = ReturnType<typeof useTranslations<"workout.compare">>;

// kľúče tried v completedExercises.module.css (styles[TONE_CLASS[tone]])
const TONE_CLASS = { below: "toneBelow", above: "toneAbove", met: "toneMet" } as const;

/** "62,5 kg" / "62.5 kg" podľa jazyka */
const kg = (n: number, locale: Locale) => `${n.toLocaleString(intlLocale(locale), { maximumFractionDigits: 2 })} kg`;

function plannedSummary(p: SnapshotExercise, t: CompareT, locale: Locale): string {
  const parts = [`${p.sets} × ${p.reps ?? "?"}`];
  parts.push(p.loadKg != null ? kg(p.loadKg, locale) : t("bodyweight"));
  if (p.tempo) parts.push(t("tempo", { tempo: p.tempo }));
  if (p.restSeconds != null) parts.push(t("rest", { seconds: p.restSeconds }));
  return parts.join(" · ");
}

function plannedCell(row: CompareRow, t: CompareT, locale: Locale): string {
  if (!row.planned) return t("extra");
  // cvik na čas („60 s“) bez „op.“
  const reps = row.planned.reps
    ? timedSeconds(row.planned.reps) != null
      ? row.planned.reps
      : t("repsShort", { reps: row.planned.reps })
    : "—";
  return row.planned.loadKg != null ? `${reps} × ${kg(row.planned.loadKg, locale)}` : reps;
}

/** Skutočné hodnoty série; opakovania a váha zafarbené podľa plánu (zelená presne, červená menej, modrá viac). */
function ActualCell({ row, t, locale }: { row: CompareRow; t: CompareT; locale: Locale }) {
  const a = row.actual;
  if (!a) return <span className={styles.notDone}>{t("notDone")}</span>;
  const tones = setTones(row);
  const parts: { text: string; tone: SetTone | null }[] = [];
  if (a.reps != null) parts.push({ text: t("repsShort", { reps: a.reps }), tone: tones.reps });
  if (a.weight != null) parts.push({ text: kg(a.weight, locale), tone: tones.weight });
  if (a.durationS != null) parts.push({ text: formatDuration(a.durationS), tone: tones.duration });
  if (a.distanceM != null) parts.push({ text: formatDistance(a.distanceM, locale), tone: null });
  if (parts.length === 0) return <>—</>;
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && " × "}
          <span className={p.tone ? styles[TONE_CLASS[p.tone]] : undefined} data-tone={p.tone ?? undefined}>
            {p.text}
          </span>
        </span>
      ))}
    </>
  );
}

export function CompletedExercises({
  exercises,
  hasPlan = true,
  flat = false,
  headingLevel = 3,
}: {
  exercises: CompareExercise[];
  hasPlan?: boolean;
  flat?: boolean;
  /** úroveň nadpisu cviku (detail trénera: 2 pod h1 stránky) */
  headingLevel?: 2 | 3 | 4;
}) {
  const Heading = `h${headingLevel}` as const;
  const t = useTranslations("workout.compare");
  const locale = useLocale() as Locale;
  const ssPositions = supersetPositions(exercises);

  return (
    <div className={`${styles.exerciseList} ${flat ? styles.flat : ""}`}>
      {exercises.map((ex, exIdx) => (
        <section key={ex.key} className={styles.exercise} data-testid="completed-exercise">
          <header className={styles.exerciseHead}>
            <Heading className={styles.exerciseName}>
              {/* superséria, v ktorej klient cvik cvičil (plán alebo spojenie počas tréningu) */}
              {ssPositions[exIdx] && (
                <span className={styles.ssTag}>{`${ssPositions[exIdx]!.letter}${ssPositions[exIdx]!.index}`}</span>
              )}
              {ex.name}
            </Heading>
            {ex.status === "skipped" && <span className={styles.chipMuted}>{t("skipped")}</span>}
            {hasPlan && ex.status === "extra" && <span className={styles.chipMuted}>{t("outsidePlan")}</span>}
          </header>
          {ex.planned && <p className={styles.plannedLine}>{t("planLine", { summary: plannedSummary(ex.planned, t, locale) })}</p>}

          {ex.rows.length > 0 && (
            <div
              className={`${styles.setTable} ${hasPlan ? "" : styles.noPlan}`}
              role="table"
              aria-label={t("setsOf", { name: ex.name })}
            >
              <div className={styles.setHeadRow} role="row">
                <span role="columnheader">{t("set")}</span>
                {hasPlan && <span role="columnheader">{t("plan")}</span>}
                <span role="columnheader">{t("actual")}</span>
              </div>
              {ex.rows.map((row) => {
                const tone = rowTone(row);
                return (
                  <div key={row.index} className={styles.setRow} role="row" data-testid="set-row">
                    <span role="cell" className={styles.setIndex}>
                      {row.index}.
                    </span>
                    {hasPlan && (
                      <span role="cell" className={styles.planned}>
                        {plannedCell(row, t, locale)}
                      </span>
                    )}
                    <span role="cell" className={styles.actual}>
                      <ActualCell row={row} t={t} locale={locale} />
                      {row.actual?.rpe != null && <span className={styles.rpe}> · RPE {row.actual.rpe}</span>}
                      {tone && tone !== "met" && (
                        <span className={styles.srOnly}>
                          {" "}
                          ({t(tone === "below" ? "toneBelow" : "toneAbove")})
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {ex.note && <p className={styles.exerciseNote}>„{ex.note}“</p>}
        </section>
      ))}
    </div>
  );
}
