"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { ExerciseLibrary } from "./ExerciseLibrary";
import { ExerciseRow } from "./ExerciseRow";
import { AddDayDialog } from "./AddDayDialog";
import { DeleteDayControl } from "./DeleteDayControl";
import { DuplicateDayButton } from "./DuplicateDayButton";
import { RenameDayForm } from "./RenameDayForm";
import { moveExerciseEntryAction, type WorkoutExerciseEntry } from "../actions";
import type { ExerciseLibraryRow } from "@/lib/exercises";
import styles from "@/app/components/workoutBuilder.module.css";
import { useActiveTabInView } from "@/app/components/useActiveTabInView";

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
  completedDayIds = [],
}: {
  planId: string;
  days: Day[];
  library: ExerciseLibraryRow[];
  /** dni, z ktorých klient už odcvičil tréning (plan_snapshot.day_id, 0048) */
  completedDayIds?: string[];
}) {
  const t = useTranslations("plans.builder");
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
    const added = known ? localDays.find((d) => !known.has(d.id)) : undefined;
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
      setActiveDayId(localDays[0].id);
    }
  }, [localDays, activeDayId]);

  const activeDay = localDays.find((d) => d.id === activeDayId) ?? null;

  const moveExercise = (dayId: string, entryId: string, direction: "up" | "down") => {
    setLocalDays((prev) =>
      prev.map((d) => {
        if (d.id !== dayId) return d;
        const i = d.exercises.findIndex((e) => e.entry_id === entryId);
        const j = direction === "up" ? i - 1 : i + 1;
        if (i < 0 || j < 0 || j >= d.exercises.length) return d;
        const exercises = [...d.exercises];
        [exercises[i], exercises[j]] = [exercises[j], exercises[i]];
        return { ...d, exercises };
      }),
    );
    startReorder(async () => {
      await moveExerciseEntryAction({ planId, dayId, entryId, direction });
    });
  };

  return (
    <div className={styles.builderGrid}>
      <div className={styles.canvas}>
        {/* Výber dňa = prepínač (dráha), nie tlačidlá; počet cvikov je len vizuálny (aria-hidden) */}
        <div ref={tabsRef} className={styles.dayTabs} role="group" aria-label={t("daysAria")} data-no-swipe>
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
              title={day.name}
            >
              <span className={styles.dayTabName}>{day.name}</span>
              <span className={styles.dayTabCount} aria-hidden="true">
                {day.exercises.length}
              </span>
            </button>
          ))}
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
        </div>

        {adding && (
          <AddDayDialog
            planId={planId}
            nextDayNumber={localDays.length + 1}
            onClose={(added) => {
              setAdding(false);
              if (!added) knownDayIds.current = null;
            }}
          />
        )}

        {activeDay &&
          (renaming ? (
            <RenameDayForm
              key={`rename-${activeDay.id}`}
              planId={planId}
              dayId={activeDay.id}
              name={activeDay.name}
              onClose={() => setRenaming(false)}
            />
          ) : (
            // akcie vybraného dňa (názov aj počet cvikov sú v dráhe dní)
            <div className={styles.dayHead}>
              <div className={styles.dayActionsRow}>
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
                  hasCompleted={completedDayIds.includes(activeDay.id)}
                />
              </div>
            </div>
          ))}

        <div className={styles.dayPanel}>
          {activeDay ? (
            activeDay.exercises.length > 0 ? (
              activeDay.exercises.map((entry, i) => (
                <ExerciseRow
                  key={entry.entry_id}
                  entry={entry}
                  dayId={activeDay.id}
                  planId={planId}
                  library={library}
                  isFirst={i === 0}
                  isLast={i === activeDay.exercises.length - 1}
                  reorderPending={reorderPending}
                  onMove={(direction) => moveExercise(activeDay.id, entry.entry_id, direction)}
                />
              ))
            ) : null
          ) : null}
        </div>
      </div>

      {/* Až za plátnom aj v DOM (nielen cez CSS order) — poradie pre klávesnicu/čítačku = vizuálne */}
      <ExerciseLibrary exercises={library} activeDayId={activeDay?.id ?? null} planId={planId} />
    </div>
  );
}
