"use client";

import { useLocale, useTranslations } from "next-intl";
import { muscleGroupLabel } from "@/lib/i18n/muscles";
import { useMemo, useState } from "react";
import type { ExerciseOption } from "@/lib/portal/types";
import { displayExerciseName } from "@/lib/exercises";
import {
  LIBRARY_MUSCLE_FILTERS,
  LIBRARY_EQUIPMENT_FILTERS,
  exerciseMatchesMuscleFilter,
  exerciseMatchesEquipmentFilter,
  type LibraryMuscleFilter,
  type LibraryEquipmentFilter,
} from "@/lib/exerciseFilters";
import { ExerciseThumb } from "@/app/components/ExerciseThumb";
import b from "./builder.module.css";
import styles from "../portal.module.css";

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
const InfoIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.4" />
    <path d="M8 7.3v4M8 5.2v.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

/**
 * Knižnica cvikov vo vlastnom tréningu klienta — rovnaký vzhľad aj ovládanie ako
 * trénerova (dashboard/treningy/[planId]/ExerciseLibrary.tsx): vlastný cvik navrchu,
 * hľadanie, stránkovanie po 7, ⓘ detail. Rozdiel: nič nezapisuje na server — cvik
 * sa pridá do rozpracovaného tréningu (onAdd) a uloží sa až s celým tréningom.
 * Vlastný cvik ide len do tréningu (klient do globálnej knižnice nepridáva).
 */
export function ClientExerciseLibrary({
  library,
  hasDay,
  defaultOpen,
  onAdd,
  onDetail,
}: {
  library: ExerciseOption[];
  hasDay: boolean;
  /** na mobile je knižnica zbaliteľná — pri novom tréningu otvorená, pri úprave zbalená ako u trénera */
  defaultOpen: boolean;
  /** pridá cvik do aktívneho dňa; vráti hlášku, ak sa nedá (napr. plný deň) */
  onAdd: (name: string, exerciseId: string | null) => string | null;
  onDetail: (exerciseId: string, name: string) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("training.library");
  const tl = useTranslations("labels");
  const [query, setQuery] = useState("");
  const [muscleFilter, setMuscleFilter] = useState<LibraryMuscleFilter | null>(null);
  const [equipmentFilter, setEquipmentFilter] = useState<LibraryEquipmentFilter | null>(null);
  const [open, setOpen] = useState(defaultOpen);
  const [customName, setCustomName] = useState("");
  const [page, setPage] = useState(0);
  // Hláška pri mieste kliku: bez dňa, prázdny názov, plný deň. Zmizne pri ďalšej akcii.
  const [hint, setHint] = useState<{ at: "custom" | "list"; text: string } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return library.filter((ex) => {
      if (muscleFilter && !exerciseMatchesMuscleFilter(ex.muscleGroup, muscleFilter)) return false;
      if (equipmentFilter && !exerciseMatchesEquipmentFilter(ex.equipment, equipmentFilter)) return false;
      if (!q) return true;
      return (
        ex.name.toLowerCase().includes(q) ||
        ex.nameSk?.toLowerCase().includes(q) ||
        ex.muscleGroup?.toLowerCase().includes(q)
      );
    });
  }, [library, query, muscleFilter, equipmentFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const add = (at: "custom" | "list", name: string, exerciseId: string | null): boolean => {
    if (!hasDay) {
      setHint({ at, text: t("addDayFirstDot") });
      return false;
    }
    const err = onAdd(name, exerciseId);
    setHint(err ? { at, text: err } : null);
    return !err;
  };

  return (
    <div className={`${b.library} ${styles.trBuilderLib}`}>
      <button type="button" className={b.libraryToggle} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={b.libraryHead}>{t("title", { count: library.length })}</span>
        <ChevronIcon className={`${b.libraryChevron} ${open ? b.libraryChevronOpen : ""}`} />
      </button>
      {!hasDay && <p className={b.libraryHint}>{t("hint")}</p>}

      <div className={`${b.libraryBody} ${!open ? b.collapsed : ""}`}>
        <form
          className={b.customExerciseForm}
          onSubmit={(e) => {
            e.preventDefault();
            if (!customName.trim()) {
              setHint({ at: "custom", text: t("nameRequired") });
              return;
            }
            if (add("custom", customName.trim(), null)) setCustomName("");
          }}
        >
          <input
            type="text"
            value={customName}
            onChange={(e) => {
              setCustomName(e.target.value);
              if (hint?.at === "custom") setHint(null);
            }}
            placeholder={t("customPlaceholder")}
            maxLength={80}
            className={b.customExerciseInput}
            aria-label={t("customAria")}
          />
          <button type="submit" className="btn btn-ghost btn-sm" title={t("customTitle")}>
            {t("addToWorkout")}
          </button>
          {hint?.at === "custom" && <p className={b.formError}>{hint.text}</p>}
        </form>

        <input
          type="text"
          placeholder={t("search")}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            // Nová fráza mení výsledky pod stránkovaním — späť na prvú stranu.
            setPage(0);
          }}
          className={b.librarySearch}
          aria-label={t("searchAria")}
        />

        <div className={b.libraryFilterRow} role="group" aria-label={t("filterMuscle")}>
          <button
            type="button"
            className={`${b.libraryFilterChip} ${muscleFilter === null ? b.libraryFilterChipActive : ""}`}
            onClick={() => {
              setMuscleFilter(null);
              setPage(0);
            }}
          >
            {t("allMuscles")}
          </button>
          {LIBRARY_MUSCLE_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={`${b.libraryFilterChip} ${muscleFilter === f ? b.libraryFilterChipActive : ""}`}
              onClick={() => {
                setMuscleFilter(muscleFilter === f ? null : f);
                setPage(0);
              }}
            >
              {tl(`muscle.${f}`)}
            </button>
          ))}
        </div>
        <div className={b.libraryFilterRow} role="group" aria-label={t("filterEquipment")}>
          <button
            type="button"
            className={`${b.libraryFilterChip} ${equipmentFilter === null ? b.libraryFilterChipActive : ""}`}
            onClick={() => {
              setEquipmentFilter(null);
              setPage(0);
            }}
          >
            {t("anyEquipment")}
          </button>
          {LIBRARY_EQUIPMENT_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={`${b.libraryFilterChip} ${equipmentFilter === f ? b.libraryFilterChipActive : ""}`}
              onClick={() => {
                setEquipmentFilter(equipmentFilter === f ? null : f);
                setPage(0);
              }}
            >
              {tl(`equipment.${f}`)}
            </button>
          ))}
        </div>

        {hint?.at === "list" && (
          <p className={b.formError} role="alert">
            {hint.text}
          </p>
        )}
        <div className={b.libraryList}>
          {library.length === 0 ? (
            <p className={b.libraryEmpty}>{t("loading")}</p>
          ) : paged.length > 0 ? (
            paged.map((ex) => {
              const name = displayExerciseName(ex.name, ex.nameSk);
              return (
                <div key={ex.id} className={b.libraryItemRow}>
                  <div className={b.libraryItemForm}>
                    <button
                      type="button"
                      className={b.libraryItem}
                      title={hasDay ? t("addToDay", { name }) : t("addDayFirst")}
                      onClick={() => add("list", name, ex.id)}
                    >
                      <ExerciseThumb src={ex.imageUrl} alt="" size={28} />
                      <span className={b.libraryItemName}>{name}</span>
                      {ex.muscleGroup && (
                        <span className={b.libraryItemMuscle} title={muscleGroupLabel(ex.muscleGroup, locale)}>
                          {muscleGroupLabel(ex.muscleGroup, locale)}
                        </span>
                      )}
                    </button>
                  </div>
                  <button
                    type="button"
                    className={b.libraryItemInfo}
                    onClick={() => onDetail(ex.id, name)}
                    aria-label={`Detail cviku ${name}`}
                  >
                    <InfoIcon />
                  </button>
                </div>
              );
            })
          ) : (
            <p className={b.libraryEmpty}>{t("noMatch")}</p>
          )}
        </div>

        {pageCount > 1 && (
          <div className={b.libraryPager}>
            <button
              type="button"
              className={b.libraryPagerBtn}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              aria-label={t("prevPage")}
            >
              <ArrowIcon className={b.libraryPagerPrev} />
            </button>
            <span className={b.libraryPagerLabel}>
              {safePage + 1} / {pageCount}
            </span>
            <button
              type="button"
              className={b.libraryPagerBtn}
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
