"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useActionState } from "react";
import { addCustomExerciseAction, addCustomExerciseToDayAction, type ActionState } from "../actions";
import { LibraryItem } from "./LibraryItem";
import type { ExerciseLibraryRow } from "@/lib/exercises";
import {
  LIBRARY_MUSCLE_FILTERS,
  LIBRARY_EQUIPMENT_FILTERS,
  exerciseMatchesMuscleFilter,
  exerciseMatchesEquipmentFilter,
  type LibraryMuscleFilter,
  type LibraryEquipmentFilter,
} from "@/lib/exerciseFilters";
import styles from "@/app/components/workoutBuilder.module.css";

const initialState: ActionState = { error: null };
const PAGE_SIZE = 7;

const ChevronIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M3.5 5.5 7 9l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ArrowIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M5.5 3l3.5 4-3.5 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function ExerciseLibrary({
  exercises,
  activeDayId,
  planId,
}: {
  exercises: ExerciseLibraryRow[];
  activeDayId: string | null;
  planId: string;
}) {
  const t = useTranslations("plans.builder");
  const tl = useTranslations("labels");
  const [query, setQuery] = useState("");
  const [muscleFilter, setMuscleFilter] = useState<LibraryMuscleFilter | null>(null);
  const [equipmentFilter, setEquipmentFilter] = useState<LibraryEquipmentFilter | null>(null);
  // null = „auto“ (CSS .libraryAuto): na počítači otvorená, na mobile zbalená pod cvikmi
  // dňa. Po ťuknutí na hlavičku platí ručná voľba na každej šírke (ako u klienta).
  const [open, setOpen] = useState<boolean | null>(null);
  // len pre aria-expanded v režime „auto“ — vizuál rieši CSS bez blikania pri načítaní
  const [wideScreen, setWideScreen] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 761px)");
    const sync = () => setWideScreen(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const isOpen = open ?? wideScreen;
  const [libState, addToLibrary, libPending] = useActionState(addCustomExerciseAction, initialState);
  const [dayState, addToDay, dayPending] = useActionState(addCustomExerciseToDayAction, initialState);
  const customPending = libPending || dayPending;
  const [page, setPage] = useState(0);
  // Klik na „Pridať do tréningu" alebo na cvik v zozname bez vytvoreného dňa —
  // okamžité upozornenie pri mieste kliku, bez zbytočného volania servera.
  // Zmizne, hneď ako existuje aktívny deň.
  const [noDayHint, setNoDayHint] = useState<"custom" | "list" | null>(null);
  useEffect(() => {
    if (activeDayId) setNoDayHint(null);
  }, [activeDayId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises.filter((ex) => {
      if (muscleFilter && !exerciseMatchesMuscleFilter(ex.muscle_group, muscleFilter)) return false;
      if (equipmentFilter && !exerciseMatchesEquipmentFilter(ex.equipment, equipmentFilter)) return false;
      if (!q) return true;
      return (
        ex.name.toLowerCase().includes(q) ||
        ex.name_sk?.toLowerCase().includes(q) ||
        ex.muscle_group?.toLowerCase().includes(q)
      );
    });
  }, [exercises, query, muscleFilter, equipmentFilter]);

  // Nová hľadaná fráza/filter mení výsledky pod nohami stránkovania — späť na prvú stranu.
  useEffect(() => {
    setPage(0);
  }, [query, muscleFilter, equipmentFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className={`${styles.library} ${open === null ? styles.libraryAuto : ""}`}>
      <button type="button" className={styles.libraryToggle} onClick={() => setOpen(!isOpen)} aria-expanded={isOpen}>
        <span className={styles.libraryHead}>{t("library", { count: exercises.length })}</span>
        <ChevronIcon className={`${styles.libraryChevron} ${open ? styles.libraryChevronOpen : ""}`} />
      </button>
      {!activeDayId && <p className={styles.libraryHint}>{t("libraryHint")}</p>}

      <div className={`${styles.libraryBody} ${open === false ? styles.collapsed : ""}`}>
        <form className={`${styles.customExerciseForm} ${styles.customExerciseGrid}`}>
          <input
            name="name"
            type="text"
            placeholder={t("customName")}
            required
            disabled={customPending}
            className={styles.customExerciseInput}
            aria-label={t("customName")}
          />
          <input
            name="muscle_group"
            type="text"
            placeholder={t("customMuscle")}
            disabled={customPending}
            className={styles.customExerciseInput}
            aria-label={t("customMuscle")}
          />
          <input type="hidden" name="plan_id" value={planId} readOnly />
          <input type="hidden" name="day_id" value={activeDayId ?? ""} readOnly />
          <button
            type="submit"
            formAction={addToDay}
            className="btn btn-ghost btn-sm"
            disabled={customPending}
            title={t("customToDayTitle")}
            onClick={(e) => {
              if (!activeDayId) {
                e.preventDefault();
                setNoDayHint("custom");
              }
            }}
          >
            {dayPending ? t("adding") : t("addToWorkout")}
          </button>
          <button type="submit" formAction={addToLibrary} className="btn btn-ghost btn-sm" disabled={customPending}>
            {libPending ? t("adding") : t("addToLibrary")}
          </button>
          {noDayHint === "custom" && !activeDayId && <p className={styles.formError}>{t("addDayFirstDot")}</p>}
          {dayState.error && <p className={styles.formError}>{dayState.error}</p>}
          {libState.error && <p className={styles.formError}>{libState.error}</p>}
        </form>

        <input
          type="text"
          placeholder={t("search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={styles.librarySearch}
        />

        <div className={styles.libraryFilterRow} role="group" aria-label={t("filterMuscle")}>
          <button
            type="button"
            className={`${styles.libraryFilterChip} ${muscleFilter === null ? styles.libraryFilterChipActive : ""}`}
            onClick={() => setMuscleFilter(null)}
          >
            {t("allMuscles")}
          </button>
          {LIBRARY_MUSCLE_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={`${styles.libraryFilterChip} ${muscleFilter === f ? styles.libraryFilterChipActive : ""}`}
              onClick={() => setMuscleFilter(muscleFilter === f ? null : f)}
            >
              {tl(`muscle.${f}`)}
            </button>
          ))}
        </div>
        <div className={styles.libraryFilterRow} role="group" aria-label={t("filterEquipment")}>
          <button
            type="button"
            className={`${styles.libraryFilterChip} ${equipmentFilter === null ? styles.libraryFilterChipActive : ""}`}
            onClick={() => setEquipmentFilter(null)}
          >
            {t("anyEquipment")}
          </button>
          {LIBRARY_EQUIPMENT_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={`${styles.libraryFilterChip} ${equipmentFilter === f ? styles.libraryFilterChipActive : ""}`}
              onClick={() => setEquipmentFilter(equipmentFilter === f ? null : f)}
            >
              {tl(`equipment.${f}`)}
            </button>
          ))}
        </div>

        {noDayHint === "list" && !activeDayId && (
          <p className={styles.formError} role="alert">
            {t("addDayFirstDot")}
          </p>
        )}
        <div className={styles.libraryList}>
          {paged.length > 0 ? (
            paged.map((ex) => (
              <LibraryItem
                key={ex.id}
                exercise={ex}
                dayId={activeDayId}
                planId={planId}
                onNoDay={() => setNoDayHint("list")}
              />
            ))
          ) : (
            <p className={styles.libraryEmpty}>{t("noMatch")}</p>
          )}
        </div>

        {pageCount > 1 && (
          <div className={styles.libraryPager}>
            <button
              type="button"
              className={styles.libraryPagerBtn}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              aria-label={t("prevPage")}
            >
              <ArrowIcon className={styles.libraryPagerPrev} />
            </button>
            <span className={styles.libraryPagerLabel}>
              {safePage + 1} / {pageCount}
            </span>
            <button
              type="button"
              className={styles.libraryPagerBtn}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage === pageCount - 1}
              aria-label={t("nextPage")}
            >
              <ArrowIcon />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
