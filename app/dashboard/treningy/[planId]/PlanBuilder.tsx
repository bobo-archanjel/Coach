"use client";

import { useLocale, useTranslations } from "next-intl";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { ExerciseLibrary } from "./ExerciseLibrary";
import { ExerciseRow } from "./ExerciseRow";
import { AddDayDialog } from "./AddDayDialog";
import { DeleteDayControl } from "./DeleteDayControl";
import { DuplicateDayButton } from "./DuplicateDayButton";
import { RenameDayDialog } from "./RenameDayDialog";
import { moveExerciseEntryAction, toggleSupersetLinkAction, type WorkoutExerciseEntry } from "../actions";
import { SupersetLink } from "@/app/components/SupersetLink";
import { detachFromSuperset, isLinkedToNext, supersetPositions, toggleLinkWithNext } from "@/lib/workouts/superset";
import type { ExerciseLibraryRow } from "@/lib/exercises";
import { formatCompletedDate } from "@/lib/workouts/completed";
import type { DoneDay } from "@/lib/dashboard/planDoneDays";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import { CompletedExercises } from "@/app/components/CompletedExercises";
import styles from "@/app/components/workoutBuilder.module.css";
import { useActiveTabInView } from "@/app/components/useActiveTabInView";

export type { DoneDay };

const CheckIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

interface Day {
  id: string;
  day_number: number;
  name: string;
  exercises: WorkoutExerciseEntry[];
}

export function PlanBuilder({
  planId,
  days,
  library,
  doneDays = {},
  locked = false,
  dayAliases = {},
}: {
  planId: string;
  days: Day[];
  library: ExerciseLibraryRow[];
  /** dni, z ktorých klient už odcvičil tréning (workout_logs.workout_day_id) — zamknuté */
  doneDays?: Record<string, DoneDay>;
  /** celý plán odcvičený (isPlanLocked) — len prehľad dní, bez „+ deň“ */
  locked?: boolean;
  /** rozpracované úpravy zverejneného plánu (0071): id dňa živého plánu → id dňa skrytej kópie.
   *  Po prvej úprave sa id dní zmenia — vybraný deň ostane ten istý. */
  dayAliases?: Record<string, string>;
}) {
  const t = useTranslations("plans.builder");
  const tl = useTranslations("clientDetail.log");
  const locale = useLocale() as Locale;
  const [activeDayId, setActiveDayId] = useState<string | null>(days[0]?.id ?? null);
  // „Premenovať“ otvorený pre aktívny deň — prepnutie dňa ho zavrie
  const [renaming, setRenaming] = useState(false);
  // okno „+ deň“
  const [adding, setAdding] = useState(false);
  // dni pred otvorením „+ deň“ — nový deň (po revalidácii) sa podľa nich nájde a vyberie
  const knownDayIds = useRef<Set<string> | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  useActiveTabInView(tabsRef, activeDayId);

  // Lokálna kópia dní kvôli optimistickému presunu poradia cvikov — po revalidácii
  // sa zosúladí so serverovou pravdou (nový `days` prop pri každom refetchi).
  const [localDays, setLocalDays] = useState(days);
  useEffect(() => setLocalDays(days), [days]);
  const [reorderPending, startReorder] = useTransition();
  // Práve skopírovaný deň (Duplikovať) — prepneme sa naň, keď ho revalidácia prinesie
  // (môže prísť pred aj po návrate akcie, preto aj ref s aktuálnymi dňami).
  const pendingDayId = useRef<string | null>(null);
  const localDaysRef = useRef(localDays);
  useEffect(() => {
    localDaysRef.current = localDays;
  }, [localDays]);

  // Ak aktívny deň zmizol (napr. z iného tabu) alebo ešte nebol vybraný, spadni na prvý dostupný.
  useEffect(() => {
    // práve pridaný deň („+ deň“) — vyber ho, ako u klienta
    const known = knownDayIds.current;
    // deň kópie úprav je „známy“, ak bol známy jeho pôvodný deň
    const sourceOf = (id: string) => Object.keys(dayAliases).find((live) => dayAliases[live] === id);
    const added = known
      ? localDays.find((d) => !known.has(d.id) && !known.has(sourceOf(d.id) ?? ""))
      : undefined;
    if (added) {
      knownDayIds.current = null;
      if (activeDayId !== added.id) setActiveDayId(added.id);
      return;
    }
    const wanted = pendingDayId.current;
    if (wanted) {
      if (!localDays.some((d) => d.id === wanted)) return;
      pendingDayId.current = null;
      if (activeDayId !== wanted) setActiveDayId(wanted);
      return;
    }
    if (localDays.length === 0) {
      if (activeDayId !== null) setActiveDayId(null);
      return;
    }
    if (!localDays.some((d) => d.id === activeDayId)) {
      const alias = activeDayId ? dayAliases[activeDayId] : undefined;
      setActiveDayId(alias && localDays.some((d) => d.id === alias) ? alias : localDays[0].id);
    }
  }, [localDays, activeDayId, dayAliases]);

  const activeDay = localDays.find((d) => d.id === activeDayId) ?? null;
  const activeDone = activeDay ? doneDays[activeDay.id] : undefined;

  const moveExercise = (dayId: string, entryId: string, direction: "up" | "down") => {
    setLocalDays((prev) =>
      prev.map((d) => {
        if (d.id !== dayId) return d;
        const i = d.exercises.findIndex((e) => e.entry_id === entryId);
        const j = direction === "up" ? i - 1 : i + 1;
        if (i < 0 || j < 0 || j >= d.exercises.length) return d;
        const exercises = [...d.exercises];
        [exercises[i], exercises[j]] = [exercises[j], exercises[i]];
        // rovnako ako server: presunutý cvik vypadne zo supersérie
        return { ...d, exercises: detachFromSuperset(exercises, j) };
      }),
    );
    startReorder(async () => {
      await moveExerciseEntryAction({ planId, dayId, entryId, direction });
    });
  };

  /** superséria: spojí cvik s nasledujúcim / rozdelí (optimisticky, server uloží) */
  const toggleSuperset = (dayId: string, entryId: string) => {
    setLocalDays((prev) =>
      prev.map((d) => {
        if (d.id !== dayId) return d;
        const i = d.exercises.findIndex((e) => e.entry_id === entryId);
        return i < 0 ? d : { ...d, exercises: toggleLinkWithNext(d.exercises, i) };
      }),
    );
    startReorder(async () => {
      await toggleSupersetLinkAction({ planId, dayId, entryId });
    });
  };

  return (
    <div className={styles.builderGrid}>
      <div className={styles.canvas}>
        {/* Výber dňa = prepínač (dráha), nie tlačidlá; počet cvikov je len vizuálny (aria-hidden) */}
        <div ref={tabsRef} className={styles.dayTabs} role="group" aria-label={t("daysAria")} data-no-swipe data-tour="plan-days">
          {localDays.map((day) => (
            <button
              key={day.id}
              type="button"
              className={`${styles.dayTab} ${day.id === activeDayId ? styles.dayTabActive : ""}`}
              onClick={() => {
                setActiveDayId(day.id);
                setRenaming(false);
              }}
              aria-current={day.id === activeDayId ? "true" : undefined}
              title={doneDays[day.id] ? `${day.name} · ${t("dayDoneShort")}` : day.name}
              data-done={doneDays[day.id] ? "true" : undefined}
            >
              {doneDays[day.id] && (
                <span className={styles.dayTabDone}>
                  <CheckIcon />
                  <span className={styles.srOnly}>{t("dayDoneShort")}: </span>
                </span>
              )}
              <span className={styles.dayTabName}>{day.name}</span>
              <span className={styles.dayTabCount} aria-hidden="true">
                {day.exercises.length}
              </span>
            </button>
          ))}
          {!locked && (
            <button
              type="button"
              className={styles.addDayTab}
              onClick={() => {
                knownDayIds.current = new Set(localDays.map((d) => d.id));
                setAdding(true);
                setRenaming(false);
              }}
            >
              {t("addDay")}
            </button>
          )}
        </div>

        {adding && !locked && (
          <AddDayDialog
            planId={planId}
            nextDayNumber={localDays.length + 1}
            onClose={(added) => {
              setAdding(false);
              if (!added) knownDayIds.current = null;
            }}
          />
        )}

        {activeDay && renaming && !activeDone && (
          <RenameDayDialog
            key={`rename-${activeDay.id}`}
            planId={planId}
            dayId={activeDay.id}
            name={activeDay.name}
            onClose={() => setRenaming(false)}
          />
        )}

        {activeDay && activeDone && (
          // odcvičený deň: bez úprav — kedy ho klient odcvičil a odkaz na detail tréningu
          <div className={styles.dayHead}>
            <div className={styles.dayDoneBar} data-testid="day-done">
              <span className={styles.dayDoneBadge}>
                <CheckIcon /> {t("dayDone", { date: formatCompletedDate(activeDone.completedAt, locale) })}
              </span>
              {!locked && <span className={styles.dayDoneHint}>{t("dayDoneHint")}</span>}
            </div>
            {(activeDone.rpe != null || activeDone.note || activeDone.editedAt) && (
              <div className={styles.dayDoneMeta}>
                {activeDone.rpe != null && (
                  <p>
                    <span className={styles.dayDoneMetaLabel}>{tl("rpe")}</span> {activeDone.rpe}/10
                  </p>
                )}
                {activeDone.note && (
                  <p>
                    <span className={styles.dayDoneMetaLabel}>{tl("clientNote")}</span> „{activeDone.note}“
                  </p>
                )}
                {activeDone.editedAt && (
                  <p className={styles.dayDoneEdited} data-testid="day-done-edited">
                    {tl("edited", {
                      date: formatCompletedDate(activeDone.editedAt, locale),
                      time: new Intl.DateTimeFormat(intlLocale(locale), {
                        timeZone: "Europe/Bratislava",
                        hour: "numeric",
                        minute: "2-digit",
                      }).format(new Date(activeDone.editedAt)),
                    })}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {activeDay && !activeDone && (
          // akcie vybraného dňa (názov aj počet cvikov sú v dráhe dní); „Premenovať“ otvorí okno
          <div className={styles.dayHead}>
            <div className={styles.dayActionsRow} data-tour="plan-day-actions">
              <button type="button" className={styles.dayActionTab} onClick={() => setRenaming(true)}>
                {t("rename")}
              </button>
              <DuplicateDayButton
                key={`dup-${activeDay.id}`}
                planId={planId}
                dayId={activeDay.id}
                onDuplicated={(newDayId) => {
                  if (localDaysRef.current.some((d) => d.id === newDayId)) setActiveDayId(newDayId);
                  else pendingDayId.current = newDayId;
                }}
              />
              <DeleteDayControl
                key={activeDay.id}
                planId={planId}
                dayId={activeDay.id}
                dayName={activeDay.name}
                exerciseCount={activeDay.exercises.length}
              />
            </div>
          </div>
        )}

        <div className={styles.dayPanel}>
          {activeDay && activeDone ? (
            activeDone.compare.exercises.length > 0 ? (
              <CompletedExercises exercises={activeDone.compare.exercises} hasPlan={activeDone.compare.hasPlan} />
            ) : (
              <p className={styles.libraryHint}>{t("dayDoneNoValues")}</p>
            )
          ) : activeDay ? (
            activeDay.exercises.length > 0 ? (
              (() => {
                const list = activeDay.exercises;
                const positions = supersetPositions(list);
                return list.map((entry, i) => {
                  const linked = isLinkedToNext(list, i);
                  const names = { a: entry.exercise_name, b: list[i + 1]?.exercise_name ?? "" };
                  return (
                    <Fragment key={entry.entry_id}>
                      <ExerciseRow
                        entry={entry}
                        dayId={activeDay.id}
                        planId={planId}
                        library={library}
                        isFirst={i === 0}
                        isLast={i === list.length - 1}
                        reorderPending={reorderPending}
                        onMove={(direction) => moveExercise(activeDay.id, entry.entry_id, direction)}
                        superset={positions[i]}
                      />
                      {i < list.length - 1 && (
                        <SupersetLink
                          linked={linked}
                          label={linked ? t("ssUnlink") : t("ssLink")}
                          ariaLabel={linked ? t("ssUnlinkAria", names) : t("ssLinkAria", names)}
                          disabled={reorderPending}
                          onToggle={() => toggleSuperset(activeDay.id, entry.entry_id)}
                        />
                      )}
                    </Fragment>
                  );
                });
              })()
            ) : null
          ) : null}
        </div>
      </div>

      {/* Až za plátnom aj v DOM (nielen cez CSS order) — poradie pre klávesnicu/čítačku = vizuálne */}
      {/* odcvičený deň sa nemení — pridávanie cvikov (vlastný cvik aj knižnica) netreba */}
      {!activeDone && <ExerciseLibrary exercises={library} activeDayId={activeDay?.id ?? null} planId={planId} />}
    </div>
  );
}
