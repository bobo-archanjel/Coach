"use client";

import { SwipeBack } from "@/app/components/SwipeBack";
import { useLocale, useTranslations } from "next-intl";
import { Fragment, useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  clearBuilderDraft,
  draftSignature,
  saveBuilderDraft,
  type DraftDay,
  type PlanBuilderDraft,
} from "./builderDraft";
import dynamic from "next/dynamic";
import type { ExerciseOption, PortalDayLog, PortalExercise, PortalPlan, PortalTemplate } from "@/lib/portal/types";
import { formatCompletedDate, type CompletedCompare } from "@/lib/workouts/completed";
import type { Locale } from "@/lib/i18n/locales";
import { CompletedExercises } from "@/app/components/CompletedExercises";
import { saveClientPlanAction, getExerciseDetailAction, getPlanReviewAction, type PlanDraft } from "./actions";
import { progressLoad, type PlanReview } from "@/lib/portal/planReview";
import { DayReview, ProgressionDialog, ReviewOverview, ReviewTimeline } from "./PlanReviewView";
import type { ExerciseDetail } from "@/lib/exercises";
import { ExerciseThumb } from "@/app/components/ExerciseThumb";
import { RepsOrTimeField } from "@/app/components/RepsOrTimeField";
import { EXERCISE_NOTE_MAX } from "@/lib/workouts/exerciseNote";
import { ClientExerciseLibrary } from "./ClientExerciseLibrary";
import b from "@/app/components/workoutBuilder.module.css";
import styles from "../portal.module.css";
import pa from "@/app/components/planActions.module.css";
import { useActiveTabInView } from "@/app/components/useActiveTabInView";
import { DayNameDialog } from "@/app/components/DayNameDialog";
import { focusAddExercise } from "@/app/components/pendingEntryEdit";
import { nextEntryDefaults } from "@/lib/workouts/nextEntryDefaults";
import { detachFromSuperset, isLinkedToNext, normalizeSupersets, supersetPositions, toggleLinkWithNext } from "@/lib/workouts/superset";
import { SupersetLink } from "@/app/components/SupersetLink";

const ExerciseDetailModal = dynamic(() =>
  import("@/app/components/ExerciseDetailModal").then((m) => m.ExerciseDetailModal),
);

/* Builder vlastného tréningu klienta — plne klientský draft, uloží sa jedným
   ťukom na "Uložiť". Vzhľad aj ovládanie sú rovnaké ako trénerov builder
   (spoločný app/components/workoutBuilder.module.css, dashboard/treningy/[planId]): pilulky dní s "+ deň" /
   "Premenovať" / "Duplikovať" / "Zmazať deň", karty cvikov so šípkami poradia, ceruzkou a košom, knižnica
   cvikov s vlastným cvikom navrchu. Používa sa aj na úpravu existujúceho
   vlastného plánu (initial). */

function uid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `k${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}

/** rovnaké limity ako saveClientPlanAction (MAX_DAYS, MAX_EXERCISES) — server by zvyšok ticho zahodil */
const MAX_DAYS = 14;
const MAX_EXERCISES = 30;

type BEx = {
  key: string;
  entryId?: string;
  exerciseId: string | null;
  name: string;
  sets: string;
  reps: string;
  loadKg: string;
  restSeconds: string;
  /** poznámka k cviku (v dátach `tempo`) */
  note: string;
  /** superséria — id skupiny (lib/workouts/superset.ts) */
  superset: string | null;
};
/** `done` = odcvičený deň uloženého plánu — zamknutý (bez úprav, premenovania, kópie, zmazania) */
type BDay = {
  key: string;
  id: string | null;
  name: string;
  exercises: BEx[];
  done?: { completedAt: string | null; compare: CompletedCompare } | null;
};

const CheckIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const EditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M9.5 1.5 12.5 4.5 4.5 12.5H1.5V9.5L9.5 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);
const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M2.5 4h9M5.5 4V2.5h3V4M3.5 4l.5 8h6l.5-8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ChevronIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M2.5 7.5 6 4l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Rovnako ako trénerov builder: hodnoty z posledného cviku dňa, inak 3×10 a pauza 90 s
// (lib/workouts/nextEntryDefaults — pridať a vyplniť v jednom kroku).
function newExercise(name: string, exerciseId: string | null, last?: BEx): BEx {
  const d = nextEntryDefaults(last ? { sets: last.sets, reps: last.reps, restSeconds: last.restSeconds } : null);
  return { key: uid(), exerciseId, name, sets: String(d.sets), reps: d.reps, loadKg: "", restSeconds: String(d.restSeconds), note: "", superset: null };
}

/** Dni pre rozpracovaný tréning — z upravovaného plánu (dni s id → úprava) alebo
    zo šablóny (bez id → úplne nový tréning, nové entry_id). */
function toDraftDays(
  days: { id?: string; name: string; exercises: PortalExercise[]; lastLog?: PortalDayLog | null }[],
): BDay[] {
  return days.map((d) => ({
    key: uid(),
    id: d.id ?? null,
    name: d.name,
    done: d.id && d.lastLog ? { completedAt: d.lastLog.completedAt, compare: d.lastLog.compare } : null,
    exercises: d.exercises.map((e) => ({
      key: uid(),
      entryId: d.id ? (e.entryId ?? undefined) : undefined,
      exerciseId: e.exerciseId,
      name: e.name,
      sets: String(e.plannedSets),
      reps: e.plannedReps ?? "10",
      loadKg: e.loadKg != null ? String(e.loadKg) : "",
      restSeconds: e.restSeconds != null ? String(e.restSeconds) : "",
      note: e.tempo ?? "",
      superset: e.superset ?? null,
    })),
  }));
}

/** dni buildera → koncept v prehliadači (bez React kľúčov a bez `done`) */
function toStoredDays(days: BDay[]): DraftDay[] {
  return days.map((d) => ({
    id: d.id,
    name: d.name,
    exercises: d.exercises.map((e) => ({
      entryId: e.entryId,
      exerciseId: e.exerciseId,
      name: e.name,
      sets: e.sets,
      reps: e.reps,
      loadKg: e.loadKg,
      restSeconds: e.restSeconds,
      note: e.note,
      superset: e.superset,
    })),
  }));
}

/** koncept z prehliadača → dni buildera; `done` (odcvičený deň) z aktuálneho plánu podľa id dňa */
function fromDraftDays(stored: DraftDay[], current: BDay[]): BDay[] {
  const doneById = new Map(current.filter((d) => d.id).map((d) => [d.id as string, d.done ?? null]));
  return stored.map((d) => {
    const done = d.id ? (doneById.get(d.id) ?? null) : null;
    // odcvičený deň sa v builderi nemení — vždy jeho aktuálna podoba, nie z konceptu
    const currentDay = d.id && done ? current.find((c) => c.id === d.id) : undefined;
    if (currentDay) return currentDay;
    return { key: uid(), id: d.id, name: d.name, done, exercises: d.exercises.map((e) => ({ ...e, key: uid() })) };
  });
}

/** Nový plán z hotového: rovnaké tréningy a cviky, záťaž +pct % pri cvikoch so splnenými sériami. */
function progressedTemplate(plan: PortalPlan, ready: Record<string, number>, pct: number, name: string): PortalTemplate {
  return {
    id: `repeat-${plan.id}`,
    name: name.slice(0, 60),
    days: plan.days.map((d) => ({
      name: d.name,
      exercises: d.exercises.map((e) => {
        const base = e.entryId ? ready[e.entryId] : undefined;
        return base != null ? { ...e, loadKg: progressLoad(base, pct) } : e;
      }),
    })),
  };
}

export function ClientPlanBuilder({
  library,
  initial,
  template = null,
  onCancel,
  onSaved,
  draftOwner,
  resume = null,
  readOnly = false,
  reviewPreview = null,
  onRepeat,
}: {
  library: ExerciseOption[];
  initial: PortalPlan | null;
  /** "Použiť" pri šablóne — nový tréning predvyplnený jej obsahom (uloží sa ako nový, šablóna ostane) */
  template?: PortalTemplate | null;
  onCancel: () => void;
  onSaved: () => void;
  /** komu patrí rozpracovaný koncept v prehliadači (builderDraft.ts) */
  draftOwner: string;
  /** „Pokračovať“ — rozpracovaný koncept z prehliadača namiesto východiska */
  resume?: PlanBuilderDraft | null;
  /** Náhľad celého odcvičeného plánu: nič sa nemení ani neukladá; hore „Analytika tréningu“ */
  readOnly?: boolean;
  /** DEV náhľad (?preview=) — vyhodnotenie bez servera */
  reviewPreview?: PlanReview | null;
  /** „Zopakovať s progresiou“ — nový plán predvyplnený z tohto (s návrhom vyššej záťaže) */
  onRepeat?: (template: PortalTemplate) => void;
}) {
  const t = useTranslations("clientBuilder");
  const locale = useLocale() as Locale;
  // Východisko: úprava / šablóna / nový tréning s jedným dňom „Deň 1“ (ako u trénera) —
  // cviky sa dajú pridávať hneď; ďalšie dni cez „+ deň“.
  const [fresh] = useState(() => ({
    // nový plán má predvyplnený názov — klient ho môže prepísať
    name: initial?.name ?? template?.name ?? t("defaultPlanName"),
    days:
      initial || template
        ? toDraftDays(initial?.days ?? template?.days ?? [])
        : [{ key: uid(), id: null, name: t("defaultDayName", { n: 1 }), exercises: [] } as BDay],
  }));
  const [name, setName] = useState(resume?.name ?? fresh.name);
  // pri „Pokračovať“ koncept; odcvičenie dňa (`done`) sa berie z aktuálneho plánu, nie z konceptu
  const [days, setDays] = useState<BDay[]>(() =>
    resume && !readOnly ? fromDraftDays(resume.days, fresh.days) : fresh.days,
  );
  // Rozpracovaný koncept v prehliadači: pri každej zmene oproti východisku sa uloží; keď sa
  // klient vráti k východisku, zmaže. Samotné otvorenie buildera starší koncept neprepíše.
  const [freshSignature] = useState(() => draftSignature({ name: fresh.name, days: toStoredDays(fresh.days) }));
  const touchedDraft = useRef(Boolean(resume));
  useEffect(() => {
    // náhľad sa nemení — koncept (karta „Pokračovať“) z neho nevzniká
    if (readOnly) return;
    const stored = toStoredDays(days);
    if (draftSignature({ name, days: stored }) !== freshSignature) {
      touchedDraft.current = true;
      saveBuilderDraft(draftOwner, { planId: initial?.id ?? null, name, days: stored });
    } else if (touchedDraft.current) {
      clearBuilderDraft(draftOwner);
    }
  }, [name, days, freshSignature, draftOwner, initial?.id, readOnly]);

  // Vyhodnotenie plánu (len náhľad) — načíta sa pri otvorení náhľadu.
  const [review, setReview] = useState<PlanReview | null>(reviewPreview);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [, startReviewTransition] = useTransition();
  const loadReview = useCallback(() => {
    if (!readOnly || !initial || reviewPreview) return;
    setReviewError(null);
    startReviewTransition(async () => {
      const res = await getPlanReviewAction(initial.id).catch(() => ({ error: t("reviewError") }));
      if ("error" in res) setReviewError(res.error);
      else setReview(res.review);
    });
  }, [readOnly, initial, reviewPreview, t]);
  useEffect(() => {
    loadReview();
  }, [loadReview]);
  // „Zopakovať s progresiou“ — okno s voľbou % (ProgressionDialog), potom builder nového plánu
  const [repeating, setRepeating] = useState(false);
  // „Zmazať koncept“ / „Zahodiť úpravy“ — potvrdenie v riadku tlačidiel (Esc = zrušiť)
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  useEffect(() => {
    if (!confirmDiscard) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmDiscard(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmDiscard]);
  const discard = () => {
    // koncept v prehliadači preč — po zatvorení sa nezobrazí karta „Pokračovať“
    touchedDraft.current = false;
    clearBuilderDraft(draftOwner);
    onCancel();
  };
  // "" = ešte nevybraný → activeDay spadne na prvý deň (nižšie).
  const [activeKey, setActiveKey] = useState<string>("");
  const [addingDay, setAddingDay] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // okno „Premenovať“ aktívny deň (lokálne, do DB až „Uložiť“)
  const [renaming, setRenaming] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);
  // práve pridaný cvik — formulár dostane fokus a po „Hotovo“ sa fokus vráti na pridávanie
  const [justAddedKey, setJustAddedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  // nová chyba → posun k nej (hore pod názvom), aj keď klient ukladal tlačidlom dole
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [error]);
  const [detailFor, setDetailFor] = useState<{ id: string; name: string } | null>(null);
  const [detail, setDetail] = useState<ExerciseDetail | null | undefined>(undefined);
  const [, startDetailTransition] = useTransition();

  const openDetail = (exerciseId: string, exName: string) => {
    setDetailFor({ id: exerciseId, name: exName });
    setDetail(undefined);
    startDetailTransition(async () => {
      const d = await getExerciseDetailAction(exerciseId);
      setDetail(d);
    });
  };

  // activeKey init sa vyhodnotí len raz — ak je prázdny, spadni na prvý deň.
  const activeDay = days.find((d) => d.key === activeKey) ?? days[0] ?? null;
  const realActiveKey = activeDay?.key ?? "";
  const activeDone = activeDay?.done ?? null;
  const tabsRef = useRef<HTMLDivElement>(null);
  useActiveTabInView(tabsRef, realActiveKey);

  // Prepnutie dňa zahodí rozpracované potvrdenie zmazania (u trénera key na DeleteDayControl).
  const selectDay = (key: string) => {
    setActiveKey(key);
    setConfirmDelete(false);
    setRenaming(false);
  };

  // Esc = zrušiť potvrdenie zmazania dňa (okná „+ deň“ / „Premenovať“ zatvára Esc samo).
  useEffect(() => {
    if (!confirmDelete) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmDelete(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmDelete]);

  const patchDay = (key: string, fn: (d: BDay) => BDay) =>
    setDays((prev) => prev.map((d) => (d.key === key ? fn(d) : d)));

  const patchExercise = (dayKey: string, exKey: string, patch: Partial<BEx>) =>
    patchDay(dayKey, (d) => ({
      ...d,
      exercises: d.exercises.map((e) => (e.key === exKey ? { ...e, ...patch } : e)),
    }));

  /** „+ deň“ z okna; vráti chybu (okno ostane otvorené) alebo null. */
  const addDay = (name: string): string | null => {
    if (!name) return t("dayNameRequired");
    if (days.length >= MAX_DAYS) return t("maxDays", { max: MAX_DAYS });
    const d: BDay = { key: uid(), id: null, name, exercises: [] };
    setDays((prev) => [...prev, d]);
    selectDay(d.key);
    setAddingDay(false);
    if (error === t("addDayRequired")) setError(null);
    return null;
  };
  const removeDay = (key: string) => {
    // odcvičený deň sa nemaže (server ho aj tak ponechá)
    setDays((prev) => prev.filter((d) => d.key !== key || d.done));
    selectDay("");
  };
  /** „Premenovať“ z okna; vráti chybu (okno ostane otvorené) alebo null. */
  const renameDay = (key: string, name: string): string | null => {
    if (!name) return t("dayNameRequired");
    patchDay(key, (d) => (d.done ? d : { ...d, name }));
    setRenaming(false);
    return null;
  };
  /** „Duplikovať“ (ako v jedálničku trénera): kópia dňa aj s cvikmi na koniec, prepne sa na ňu.
      Nový deň aj cviky bez id — server im pri „Uložiť“ pridelí nové (ako pri šablóne). */
  const duplicateDay = (key: string) => {
    const src = days.find((d) => d.key === key);
    if (!src || src.done || days.length >= MAX_DAYS) return;
    const copy: BDay = {
      key: uid(),
      id: null,
      name: t("copyName", { name: src.name }).slice(0, 60),
      exercises: src.exercises.map((e) => ({ ...e, key: uid(), entryId: undefined })),
    };
    setDays((prev) => [...prev, copy]);
    selectDay(copy.key);
  };

  const addExercise = (exName: string, exerciseId: string | null): string | null => {
    if (!activeDay) return t("addDayFirst");
    if (activeDay.done) return t("dayDoneHint");
    if (activeDay.exercises.length >= MAX_EXERCISES) return t("maxExercises", { max: MAX_EXERCISES });
    const ex = newExercise(exName, exerciseId, activeDay.exercises[activeDay.exercises.length - 1]);
    patchDay(activeDay.key, (d) => ({ ...d, exercises: [...d.exercises, ex] }));
    // pridať a vyplniť v jednom kroku — nový cvik rovno na úpravu
    setEditKey(ex.key);
    setJustAddedKey(ex.key);
    return null;
  };
  const removeExercise = (dayKey: string, exKey: string) =>
    patchDay(dayKey, (d) => ({ ...d, exercises: normalizeSupersets(d.exercises.filter((e) => e.key !== exKey)) }));
  /** superséria: spojí cvik s nasledujúcim / rozdelí (lib/workouts/superset.ts) */
  const toggleSuperset = (dayKey: string, exKey: string) =>
    patchDay(dayKey, (d) => {
      const i = d.exercises.findIndex((e) => e.key === exKey);
      return i < 0 ? d : { ...d, exercises: toggleLinkWithNext(d.exercises, i) };
    });
  const moveExercise = (dayKey: string, exKey: string, direction: "up" | "down") =>
    patchDay(dayKey, (d) => {
      const i = d.exercises.findIndex((e) => e.key === exKey);
      const j = direction === "up" ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= d.exercises.length) return d;
      const exercises = [...d.exercises];
      [exercises[i], exercises[j]] = [exercises[j], exercises[i]];
      // presunutý cvik vypadne zo supersérie (ako u trénera)
      return { ...d, exercises: detachFromSuperset(exercises, j) };
    });

  const save = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t("planNameRequired"));
      // pole je hore — kurzor doň (a posun k nemu), nech klient hneď vidí, čo chýba
      nameRef.current?.focus({ preventScroll: true });
      return;
    }
    if (days.length === 0) {
      setError(t("addDayRequired"));
      return;
    }
    const draft: PlanDraft = {
      name: trimmedName,
      days: days.map((d) => ({
        id: d.id,
        name: d.name.trim(),
        exercises: d.exercises
          .filter((e) => e.name.trim())
          .map((e) => ({
            entryId: e.entryId,
            exerciseId: e.exerciseId,
            name: e.name.trim(),
            sets: Number(e.sets) || 3,
            reps: e.reps.trim() || "10",
            loadKg: e.loadKg.trim() === "" ? null : Number(e.loadKg),
            restSeconds: e.restSeconds.trim() === "" ? null : Number(e.restSeconds),
            note: e.note.trim(),
            superset: e.superset,
          })),
      })),
    };
    setError(null);
    startTransition(async () => {
      const res = await saveClientPlanAction(JSON.stringify(draft), initial?.id);
      if (res.error) setError(res.error);
      else {
        clearBuilderDraft(draftOwner);
        onSaved();
      }
    });
  };

  const positions = activeDay ? supersetPositions(activeDay.exercises) : [];

  return (
    // Späť (zatvoriť builder bez uloženia): potiahnutie zľava doprava na mobile, späť v
    // prehliadači alebo „Tréning“ v menu (TrainingSection, ?tvorba) — tlačidlo „Späť“ tu nie je.
    <SwipeBack onBack={onCancel}>
      <section aria-label={readOnly ? t("previewAria") : initial ? t("editAria") : t("newAria")} className={styles.trWrap}>
        {readOnly ? (
          <>
            <div className={styles.trNameField}>
              <span className={styles.panelLabel}>{t("planName")}</span>
              {/* v náhľade nie je hlavička „Tréning“ — názov plánu je nadpis stránky */}
            <h1 className={styles.trNameStatic}>{name}</h1>
            </div>
            <ReviewOverview review={review} error={reviewError} onRetry={loadReview} />
          </>
        ) : (
        <label className={styles.trNameField} data-tour="cbuilder-name">
          <span className={styles.panelLabel}>{t("planName")}</span>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              // Hláška o chýbajúcom názve nemá visieť, keď ho klient už dopĺňa (QA 2026-09-23).
              if (error === t("planNameRequired")) setError(null);
            }}
            placeholder={t("namePlaceholder")}
            maxLength={60}
            className={styles.trNameInput}
            ref={nameRef}
            aria-invalid={error === t("planNameRequired") || undefined}
          />
        </label>
        )}

        {/* Rozloženie ako u trénera: pod názvom Uložiť + Zmazať koncept (nový plán) /
            Zahodiť úpravy (úprava) — s potvrdením; dolné „Uložiť tréning“ už nie je. */}
        {!readOnly &&
          (confirmDiscard ? (
            <div className={pa.confirm} role="alertdialog" aria-labelledby="discard-question">
              <p id="discard-question" className={pa.confirmText}>
                {initial ? t("discardEditsConfirm") : t("deleteDraftConfirm")}
              </p>
              <span className={pa.confirmBtns}>
                <button type="button" className={pa.confirmNo} onClick={() => setConfirmDiscard(false)}>
                  {t("cancel")}
                </button>
                <button type="button" className={pa.confirmYes} onClick={discard}>
                  {initial ? t("yesDiscard") : t("yesDelete")}
                </button>
              </span>
            </div>
          ) : (
            <div className={styles.trActionsGrid}>
              <button type="button" className={styles.trSaveBtn} onClick={save} disabled={pending} data-tour="cbuilder-save">
                {pending ? t("saving") : t("save")}
              </button>
              <button type="button" className={styles.trDiscardBtn} onClick={() => setConfirmDiscard(true)} disabled={pending}>
                {initial ? t("discardEdits") : t("deleteDraft")}
              </button>
            </div>
          ))}

        {/* Chyba hore pod názvom (predtým až pod knižnicou cvikov — na mobile ju klient nevidel);
            stránka sa k nej pri ukladaní posunie. */}
        {error && (
          <p ref={errorRef} className={styles.trError} role="alert">
            {error}
          </p>
        )}

        <div className={`${b.builderGrid} ${styles.trBuilderGrid}`}>
          <div className={`${b.canvas} ${styles.trBuilderCanvas}`}>
            {/* Výber dňa = prepínač (dráha), nie tlačidlá; počet cvikov je len vizuálny (aria-hidden) */}
            <div ref={tabsRef} className={b.dayTabs} role="group" aria-label={t("daysAria")} data-no-swipe data-tour="cbuilder-days">
              {days.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  className={`${b.dayTab} ${d.key === realActiveKey ? b.dayTabActive : ""}`}
                  onClick={() => selectDay(d.key)}
                  aria-current={d.key === realActiveKey ? "true" : undefined}
                  title={d.done ? `${d.name} · ${t("dayDoneShort")}` : d.name}
                  data-done={d.done ? "true" : undefined}
                >
                  {d.done && (
                    <span className={b.dayTabDone}>
                      <CheckIcon />
                      <span className={b.srOnly}>{t("dayDoneShort")}: </span>
                    </span>
                  )}
                  <span className={b.dayTabName}>{d.name}</span>
                  <span className={b.dayTabCount} aria-hidden="true">
                    {d.exercises.length}
                  </span>
                </button>
              ))}
              {!readOnly && (
              <button
                type="button"
                className={b.addDayTab}
                onClick={() => {
                  setAddingDay(true);
                  setRenaming(false);
                }}
              >
                {t("addDay")}
              </button>
              )}
            </div>

            {addingDay && (
              // deň plánu = jeden tréning (napr. "Deň 1 — Push")
              <DayNameDialog
                title={t("newDayTitle")}
                label={t("dayName")}
                inputId="client-day-name"
                placeholder={t("dayPlaceholder", { n: days.length + 1 })}
                maxLength={60}
                submitLabel={t("add")}
                cancelLabel={t("cancel")}
                closeLabel={t("close")}
                onSubmit={addDay}
                onClose={() => setAddingDay(false)}
              />
            )}

            {activeDay && renaming && !activeDone && (
              <DayNameDialog
                key={`rename-${activeDay.key}`}
                title={t("renameDayTitle")}
                label={t("dayName")}
                inputId="client-day-rename"
                initialValue={activeDay.name}
                maxLength={60}
                submitLabel={t("done")}
                cancelLabel={t("cancel")}
                closeLabel={t("close")}
                onSubmit={(name) => renameDay(activeDay.key, name)}
                onClose={() => setRenaming(false)}
              />
            )}

            {activeDay && activeDone && (
              // odcvičený deň: bez úprav, len kedy a čo klient naozaj odcvičil
              <div className={b.dayHead}>
                <div className={b.dayDoneBar} data-testid="day-done">
                  <span className={b.dayDoneBadge}>
                    <CheckIcon />{" "}
                    {activeDone.completedAt
                      ? t("dayDone", { date: formatCompletedDate(activeDone.completedAt, locale) })
                      : t("dayDoneShort")}
                  </span>
                  {!readOnly && <span className={b.dayDoneHint}>{t("dayDoneHint")}</span>}
                </div>
              </div>
            )}

            {activeDay && !activeDone && !readOnly && (
              // akcie vybraného dňa (názov aj počet cvikov sú v dráhe dní)
              <div className={b.dayHead}>
                <div className={b.dayActionsRow}>
                  {confirmDelete ? (
                    <div className={b.deleteDayConfirm} role="alertdialog" aria-labelledby="delete-day-question">
                      <p id="delete-day-question" className={b.deleteDayQuestion}>
                        {t("deleteDayConfirm", { name: activeDay.name, count: activeDay.exercises.length })}
                      </p>
                      <div className={b.deleteDayActions}>
                        <button type="button" className="btn btn-primary btn-sm btn-danger" onClick={() => removeDay(activeDay.key)}>
                          {t("yesDeleteDay")}
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>
                          {t("cancel")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={b.dayActionTab}
                        onClick={() => {
                          setRenaming(true);
                          setAddingDay(false);
                        }}
                      >
                        {t("rename")}
                      </button>
                      <button
                        type="button"
                        className={b.dayActionTab}
                        onClick={() => duplicateDay(activeDay.key)}
                        disabled={days.length >= MAX_DAYS}
                        title={
                          days.length >= MAX_DAYS
                            ? t("maxDays", { max: MAX_DAYS })
                            : t("duplicateTitle")
                        }
                      >
                        {t("duplicate")}
                      </button>
                      <button type="button" className={b.deleteDayTab} onClick={() => setConfirmDelete(true)}>
                        {t("deleteDay")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className={b.dayPanel}>
              {readOnly ? (
                <DayReview compare={activeDone?.compare ?? null} review={review} />
              ) : activeDay && activeDone ? (
                activeDone.compare.exercises.length > 0 ? (
                  <CompletedExercises exercises={activeDone.compare.exercises} hasPlan={activeDone.compare.hasPlan} />
                ) : (
                  <p className={b.libraryHint}>{t("dayDoneNoValues")}</p>
                )
              ) : activeDay ? (
                activeDay.exercises.length > 0 ? (
                  activeDay.exercises.map((ex, i) => {
                    const ss = positions[i];
                    const linked = isLinkedToNext(activeDay.exercises, i);
                    const next = activeDay.exercises[i + 1];
                    return (
                    <Fragment key={ex.key}>
                    {editKey === ex.key ? (
                      <ExerciseEditForm
                        ex={ex}
                        autoFocus={justAddedKey === ex.key}
                        onApply={(patch) => {
                          patchExercise(activeDay.key, ex.key, patch);
                          setEditKey(null);
                          if (justAddedKey === ex.key) {
                            setJustAddedKey(null);
                            focusAddExercise();
                          }
                        }}
                        onCancel={() => {
                          setEditKey(null);
                          setJustAddedKey(null);
                        }}
                      />
                    ) : (
                      <div className={`${b.exerciseRow} ${ss ? b.ssMember : ""}`} data-superset={ss ? `${ss.letter}${ss.index}` : undefined}>
                        {ex.exerciseId ? (
                          <button type="button" className={b.exerciseNameBtn} onClick={() => openDetail(ex.exerciseId!, ex.name)}>
                            {ss && <span className={b.ssTag}>{`${ss.letter}${ss.index}`}</span>}
                            <ExerciseThumb src={library.find((l) => l.id === ex.exerciseId)?.imageUrl ?? null} alt="" size={26} />
                            <span className={b.exerciseName}>{ex.name}</span>
                          </button>
                        ) : (
                          <div className={b.exerciseNameStatic}>
                            {ss && <span className={b.ssTag}>{`${ss.letter}${ss.index}`}</span>}
                            <ExerciseThumb src={null} alt="" size={26} />
                            <span className={b.exerciseName}>{ex.name}</span>
                          </div>
                        )}
                        <span className={b.exerciseSummary}>
                          {ex.sets || "3"}× {ex.reps || "10"}
                          {ex.loadKg.trim() ? ` @ ${ex.loadKg} kg` : ""}
                        </span>
                        {ss && !ss.last ? (
                          // v supersérii bez pauzy medzi cvikmi — pauza až po kole
                          <span className={`${b.exerciseMeta} ${b.ssMeta}`}>{t("ssNext", { next: `${ss.letter}${ss.index + 1}` })}</span>
                        ) : ss ? (
                          <span className={`${b.exerciseMeta} ${b.ssMeta}`}>
                            {ex.restSeconds.trim() ? t("ssRoundRest", { seconds: ex.restSeconds }) : t("ssRoundNoRest")}
                          </span>
                        ) : (
                          ex.restSeconds.trim() && <span className={b.exerciseMeta}>{t("restValue", { seconds: ex.restSeconds })}</span>
                        )}
                        {ex.note.trim() && <span className={b.exerciseNote}>„{ex.note.trim()}“</span>}
                        <div className={b.rowActions}>
                          <div className={b.reorderBtns}>
                            <button
                              type="button"
                              className={b.iconBtn}
                              onClick={() => moveExercise(activeDay.key, ex.key, "up")}
                              disabled={i === 0}
                              aria-label={t("moveUp")}
                            >
                              <ChevronIcon />
                            </button>
                            <button
                              type="button"
                              className={`${b.iconBtn} ${b.reorderDown}`}
                              onClick={() => moveExercise(activeDay.key, ex.key, "down")}
                              disabled={i === activeDay.exercises.length - 1}
                              aria-label={t("moveDown")}
                            >
                              <ChevronIcon />
                            </button>
                          </div>
                          <button type="button" className={b.iconBtn} onClick={() => setEditKey(ex.key)} aria-label={t("editExercise")}>
                            <EditIcon />
                          </button>
                          <button
                            type="button"
                            className={`${b.iconBtn} btn-danger`}
                            onClick={() => removeExercise(activeDay.key, ex.key)}
                            aria-label={t("removeExercise")}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </div>
                    )}
                    {next && (
                      <SupersetLink
                        linked={linked}
                        label={linked ? t("ssUnlink") : t("ssLink")}
                        ariaLabel={linked ? t("ssUnlinkAria", { a: ex.name, b: next.name }) : t("ssLinkAria", { a: ex.name, b: next.name })}
                        onToggle={() => toggleSuperset(activeDay.key, ex.key)}
                      />
                    )}
                    </Fragment>
                    );
                  })
                ) : null
              ) : null}
            </div>
          </div>

          {/* Až za plátnom aj v DOM — poradie pre klávesnicu/čítačku = vizuálne */}
          {/* odcvičený deň sa nemení — pridávanie cvikov netreba (ako u trénera) */}
          {!activeDone && !readOnly && (
            <ClientExerciseLibrary library={library} hasDay={activeDay !== null} onAdd={addExercise} onDetail={openDetail} />
          )}
        </div>

        {readOnly && (
          <>
            <ReviewTimeline review={review} />
            {onRepeat && (
              <div className={styles.rvRepeat}>
                <button type="button" className={`btn btn-primary ${styles.startBtn}`} onClick={() => setRepeating(true)}>
                  {t("repeat")}
                </button>
                <p className={styles.trHint}>{t("repeatHint")}</p>
              </div>
            )}
            {repeating && initial && onRepeat && (
              <ProgressionDialog
                days={initial.days}
                ready={review?.ready ?? {}}
                onCreate={(pct) => onRepeat(progressedTemplate(initial, review?.ready ?? {}, pct, t("repeatName", { name: initial.name })))}
                onClose={() => setRepeating(false)}
              />
            )}
          </>
        )}

        {detailFor && (
          <ExerciseDetailModal detail={detail} fallbackName={detailFor.name} onClose={() => setDetailFor(null)} />
        )}
      </section>
    </SwipeBack>
  );
}

/** Úprava cviku — rovnaký formulár ako u trénera (ExerciseRow), mení len rozpracovaný tréning. */
function ExerciseEditForm({
  ex,
  autoFocus = false,
  onApply,
  onCancel,
}: {
  ex: BEx;
  /** práve pridaný cvik: formulár do záberu, fokus na Série */
  autoFocus?: boolean;
  onApply: (patch: Pick<BEx, "sets" | "reps" | "loadKg" | "restSeconds" | "note">) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("clientBuilder");
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!autoFocus) return;
    const form = formRef.current;
    form?.scrollIntoView({ block: "center", behavior: "smooth" });
    const sets = form?.querySelector<HTMLInputElement>('input[name="sets"]');
    sets?.focus({ preventScroll: true });
    sets?.select();
  }, [autoFocus]);
  return (
    <form
      ref={formRef}
      className={b.editForm}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const val = (k: string) => String(f.get(k) ?? "").trim();
        onApply({ sets: val("sets"), reps: val("reps"), loadKg: val("load_kg"), restSeconds: val("rest_seconds"), note: val("note") });
      }}
    >
      <span className={b.editName}>{ex.name}</span>
      <div className={b.editGrid}>
        <label className={`${b.editField} ${b.editFieldSets}`}>
          <span className={b.editFieldLabel}>{t("sets")}</span>
          <input name="sets" type="number" inputMode="numeric" min={1} max={20} defaultValue={ex.sets} required />
        </label>
        <RepsOrTimeField defaultValue={ex.reps} className={b.editFieldReps} />
        <label className={`${b.editField} ${b.editFieldLoad}`}>
          <span className={b.editFieldLabel}>{t("load")}</span>
          <input name="load_kg" type="number" inputMode="decimal" step="0.5" min={0} defaultValue={ex.loadKg} placeholder="—" />
        </label>
        <label className={`${b.editField} ${b.editFieldRest}`}>
          <span className={b.editFieldLabel}>{t("rest")}</span>
          <input name="rest_seconds" type="number" inputMode="numeric" min={0} defaultValue={ex.restSeconds} placeholder="—" />
        </label>
        <label className={`${b.editField} ${b.editFieldNote}`}>
          <span className={b.editFieldLabel}>{t("note")}</span>
          <input name="note" type="text" maxLength={EXERCISE_NOTE_MAX} defaultValue={ex.note} placeholder={t("notePlaceholder")} />
        </label>
      </div>
      <div className={b.editActions}>
        {/* "Hotovo", nie "Uložiť" ako u trénera — tu sa nič neukladá, zmena čaká na "Uložiť tréning". */}
        <button type="submit" className="btn btn-primary btn-sm">
          {t("done")}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
