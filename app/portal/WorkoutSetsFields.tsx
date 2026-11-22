"use client";

import { useLocale, useTranslations } from "next-intl";
import { Fragment, useEffect, useState, type MouseEvent } from "react";
import { SupersetLink } from "@/app/components/SupersetLink";
import { BuilderDialog } from "@/app/components/BuilderDialog";
import { normalizeSupersets, supersetPositions, toggleLinkWithNext } from "@/lib/workouts/superset";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import type { LoggedExercise, PortalExercise } from "@/lib/portal/types";
import {
  parseReps,
  parseWeight,
  REPS_MAX,
  summarizeWorkoutForm,
  WEIGHT_MAX_KG,
  type SetDraftRow,
} from "@/lib/workouts/setInput";
import { timedSeconds } from "@/lib/workouts/timedReps";
import styles from "./portal.module.css";

/**
 * Polia zápisu tréningu (série, poznámka ku cviku, RPE, poznámka k tréningu) —
 * zdieľané formulárom "Ukončiť tréning" (LogWorkoutButton) aj "Upraviť hodnoty"
 * (LoggedWorkoutEditor, 24 h po ukončení, 0049), aby vyzerali a validovali rovnako.
 */

export type SetRow = SetDraftRow;

export interface WorkoutFormValues {
  rows: Record<number, SetRow[]>;
  /** index cviku → text; `undefined` = pole poznámky ešte nie je rozbalené */
  notes: Record<number, string | undefined>;
  rpe: string;
  sessionNote: string;
  /** cviky, ktoré si klient pridal počas tréningu (ručne, názov + opakovania/čas) — za
   *  cvikmi plánu, takže ich riadky/poznámky majú indexy exercises.length + i */
  added?: AddedExercise[];
  /** supersérie tohto tréningu po indexoch cvikov (plán + spojenia klienta počas tréningu);
   *  chýba = podľa plánu (lib/workouts/superset.ts) */
  supersets?: (string | null)[];
  /** poradie zobrazenia — indexy cvikov (plán + pridané); pridaný cvik sa dá vložiť medzi
   *  cviky. Riadky / poznámky / supersérie ostávajú podľa indexu cviku. Chýba = poradie indexov. */
  order?: number[];
  /** odškrtnuté (odcvičené) série podľa indexu cviku — len postup počas tréningu (krúžok
   *  na karte Dnes); ukladajú sa všetky vyplnené série bez ohľadu na odškrtnutie */
  checked?: Record<number, boolean[]>;
  /** zbalené cviky (indexy) — klient si po odcvičení cvik schová (len karta Dnes) */
  collapsed?: number[];
}

/** Poradie zobrazenia cvikov (platná permutácia indexov, inak 0..n-1). */
export function displayOrder(count: number, values: WorkoutFormValues): number[] {
  const o = values.order;
  if (o && o.length === count && new Set(o).size === count && o.every((i) => Number.isInteger(i) && i >= 0 && i < count)) {
    return o;
  }
  return Array.from({ length: count }, (_, i) => i);
}

/** Supersérie tréningu podľa indexu cviku: klientove spojenia, inak z plánu (pridané cviky
 *  samostatne). Skupiny sa upratujú v poradí zobrazenia (vložený cvik skupinu rozdelí). */
export function effectiveSupersets(exercises: PortalExercise[], values: WorkoutFormValues): (string | null)[] {
  const raw =
    values.supersets && values.supersets.length === exercises.length
      ? values.supersets
      : exercises.map((e) => e.superset ?? null);
  const order = displayOrder(exercises.length, values);
  const ordered = normalizeSupersets(order.map((i) => ({ superset: raw[i] ?? null }))).map((x) => x.superset ?? null);
  const out: (string | null)[] = exercises.map(() => null);
  order.forEach((i, pos) => {
    out[i] = ordered[pos];
  });
  return out;
}

/** Postup tréningu: cvik je hotový, keď má aspoň jednu sériu a všetky sú odškrtnuté. */
export function workoutProgress(planExercises: PortalExercise[], values: WorkoutFormValues): { done: number; total: number } {
  const total = formExercises(planExercises, values).length;
  let done = 0;
  for (let i = 0; i < total; i++) {
    const n = (values.rows[i] ?? []).length;
    const checked = values.checked?.[i] ?? [];
    if (n > 0 && Array.from({ length: n }, (_, k) => checked[k] === true).every(Boolean)) done++;
  }
  return { done, total };
}

/** Cvik pridaný počas tréningu; `timed` = meria sa čas (sekundy), nie opakovania. */
export type AddedExercise = { name: string; timed?: boolean };

/** Cvik na čas: z plánu („60 s“) alebo pridaný počas tréningu s voľbou „Čas“. */
export function isTimedExercise(ex: PortalExercise): boolean {
  return ex.timed === true || timedSeconds(ex.plannedReps) != null;
}

/** Koľko prázdnych sérií dostane cvik pridaný počas tréningu. */
const ADDED_SETS = 3;
export const ADDED_NAME_MAX = 80;

/** Cvik pridaný klientom počas tréningu — bez plánu (entryId null = „mimo plánu“ u trénera). */
export function addedExercise({ name, timed }: AddedExercise, i: number): PortalExercise {
  return {
    idx: `added-${i}`,
    name,
    timed: timed === true,
    scheme: "",
    load: "",
    rest: "",
    entryId: null,
    plannedSets: ADDED_SETS,
    plannedReps: null,
    exerciseId: null,
    loadKg: null,
    restSeconds: null,
  };
}

/** Cviky formulára: plán dňa + cviky pridané klientom. */
export function formExercises(exercises: PortalExercise[], values: WorkoutFormValues): PortalExercise[] {
  return [...exercises, ...(values.added ?? []).map(addedExercise)];
}

/** Odstráni kľúč `at` a posunie vyššie indexy o jeden nadol (riadky/poznámky podľa indexu cviku). */
function dropIndex<T>(rec: Record<number, T>, at: number): Record<number, T> {
  const out: Record<number, T> = {};
  for (const [k, v] of Object.entries(rec)) {
    const i = Number(k);
    if (i === at) continue;
    out[i > at ? i - 1 : i] = v;
  }
  return out;
}

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PlusIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

const CloseIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

/** Váha z plánu ako placeholder ("60" / "62,5") — klient vidí, čo má dvíhať. */
function weightPlaceholder(kg: number | null, locale: Locale): string {
  return kg != null ? kg.toLocaleString(intlLocale(locale), { maximumFractionDigits: 2 }) : "kg";
}

const numToField = (n: number | null | undefined) =>
  n == null ? "" : n.toLocaleString("sk-SK", { maximumFractionDigits: 2, useGrouping: false });

/**
 * Séria predvyplnená hodnotami trénera — klient, ktorý odcvičí presne plán, nemusí nič
 * vypĺňať. Opakovania len pri jednom čísle („10“); rozsah („8-10“), „max“ či čas („45 s“)
 * ostanú prázdne s plánom ako placeholder — tam musí klient zapísať, koľko naozaj spravil.
 */
export function plannedSetRow(ex: PortalExercise): SetRow {
  // cvik na čas („60 s“): prvé pole sú sekundy, predvyplnené časom trénera
  const secs = timedSeconds(ex.plannedReps);
  if (secs != null) return { reps: String(secs), weight: numToField(ex.loadKg) };
  const reps = ex.plannedReps?.trim() ?? "";
  return { reps: /^\d+$/.test(reps) ? reps : "", weight: numToField(ex.loadKg) };
}

/** Riadky sérií podľa plánu buildera, predvyplnené hodnotami trénera (nový tréning). */
export function plannedFormValues(exercises: PortalExercise[]): WorkoutFormValues {
  return {
    rows: Object.fromEntries(exercises.map((ex, i) => [i, Array.from({ length: ex.plannedSets }, () => plannedSetRow(ex))])),
    notes: {},
    rpe: "",
    sessionNote: "",
  };
}

/** Prázdne riadky podľa plánu buildera (koľko sérií plánuje tréner). */
export function emptyFormValues(exercises: PortalExercise[]): WorkoutFormValues {
  return {
    rows: Object.fromEntries(
      exercises.map((ex, i) => [i, Array.from({ length: ex.plannedSets }, () => ({ reps: "", weight: "" }))]),
    ),
    notes: {},
    rpe: "",
    sessionNote: "",
  };
}

/**
 * Predvyplnenie z uloženého záznamu pre "Upraviť hodnoty" — cviky podľa plánu dňa,
 * zapísané série spárované podľa entryId (fallback názov). Cvik bez zápisu dostane
 * prázdne riadky podľa plánu, nech sa dá dodatočne doplniť.
 */
export function formValuesFromLog(
  exercises: PortalExercise[],
  logged: LoggedExercise[],
  rpe: number | null,
  note: string | null,
): WorkoutFormValues {
  const base = emptyFormValues(exercises);
  const notes: Record<number, string | undefined> = {};
  const used = new Set<LoggedExercise>();
  // index cviku formulára pre každý zapísaný cvik — poradie zobrazenia podľa zápisu
  const indexOf = new Map<LoggedExercise, number>();
  // supersérie zo zápisu (spojenia počas tréningu); starší zápis bez nich → podľa plánu
  const loggedHasSupersets = logged.some((l) => l.superset);
  const supersets: (string | null)[] = [];
  const fill = (i: number, match: LoggedExercise, timed: boolean) => {
    used.add(match);
    indexOf.set(match, i);
    if (loggedHasSupersets) supersets[i] = match.superset ?? null;
    if (match.sets.length > 0) {
      base.rows[i] = match.sets.map((s) => ({
        reps: numToField(timed ? (s.durationS ?? s.reps) : s.reps),
        weight: numToField(s.weight),
      }));
    }
    if (match.note) notes[i] = match.note;
  };
  exercises.forEach((ex, i) => {
    const match =
      (ex.entryId && logged.find((l) => !used.has(l) && l.entryId === ex.entryId)) ||
      logged.find((l) => !used.has(l) && l.name.toLowerCase() === ex.name.toLowerCase()) ||
      null;
    if (match) fill(i, match, isTimedExercise(ex));
  });
  // zapísané cviky mimo plánu (pridané počas tréningu) — inak by ich uloženie úpravy zmazalo;
  // na čas, keď má každá séria len sekundy
  const added: AddedExercise[] = [];
  for (const l of logged) {
    if (used.has(l)) continue;
    const timed = l.sets.length > 0 && l.sets.every((s) => s.reps == null && s.durationS != null);
    fill(exercises.length + added.length, l, timed);
    added.push(timed ? { name: l.name, timed } : { name: l.name });
  }
  const all = exercises.length + added.length;
  // Poradie: zapísané cviky v poradí zápisu (pridaný cvik ostane tam, kam ho klient vložil);
  // nezapísané cviky plánu na svojom mieste medzi nimi, zvyšok na koniec.
  const order: number[] = [];
  const placed = new Set<number>();
  const place = (i: number) => {
    if (!placed.has(i)) {
      placed.add(i);
      order.push(i);
    }
  };
  for (const l of logged) {
    const i = indexOf.get(l);
    if (i === undefined) continue;
    if (i < exercises.length) for (let k = 0; k < i; k++) if (!logged.some((x) => indexOf.get(x) === k)) place(k);
    place(i);
  }
  for (let k = 0; k < all; k++) place(k);
  return {
    order,
    rows: base.rows,
    notes,
    rpe: rpe != null ? String(rpe) : "",
    sessionNote: note ?? "",
    added,
    ...(loggedHasSupersets && { supersets: Array.from({ length: all }, (_, i) => supersets[i] ?? null) }),
  };
}

/** Série a poznámky na odoslanie (JSON pre finishWorkoutAction / updateWorkoutLogAction). */
export function buildEntriesPayload(planExercises: PortalExercise[], values: WorkoutFormValues) {
  const exercises = formExercises(planExercises, values);
  const summary = summarizeWorkoutForm(exercises.length, values.rows);
  const supersets = effectiveSupersets(exercises, values);
  // v poradí zobrazenia (cvik vložený medzi cviky ostane na svojom mieste aj v zápise)
  const entries = displayOrder(exercises.length, values).map((i) => {
    const ex = exercises[i];
    const sets = summary.sets[i] ?? [];
    return {
      entryId: ex.entryId,
      name: ex.name,
      note: values.notes[i]?.trim() || undefined,
      superset: supersets[i] ?? undefined,
      // cvik na čas: číslo z prvého poľa sú sekundy (durationS), nie opakovania
      sets: isTimedExercise(ex) ? sets.map((s) => ({ reps: null, weight: s.weight, durationS: s.reps })) : sets,
    };
  });
  return { summary, entries };
}

export function WorkoutSetsFields({
  exercises: planExercises,
  values,
  onChange,
  showInvalid,
  checkable = false,
}: {
  exercises: PortalExercise[];
  values: WorkoutFormValues;
  onChange: (next: WorkoutFormValues) => void;
  showInvalid: boolean;
  /** odškrtávanie sérií (počas tréningu na karte Dnes; pri „Upraviť hodnoty“ nie) */
  checkable?: boolean;
}) {
  const t = useTranslations("workout");
  const tl = useTranslations("labels");
  const locale = useLocale();
  const { rows, notes, rpe, sessionNote } = values;
  const added = values.added ?? [];
  const checked = values.checked ?? {};
  const collapsed = values.collapsed ?? [];
  const exercises = formExercises(planExercises, values);
  const order = displayOrder(exercises.length, values);
  const supersets = effectiveSupersets(exercises, values);
  // pozície v supersérii podľa poradia zobrazenia
  const ssPositions = supersetPositions(order.map((i) => ({ superset: supersets[i] })));
  const setRows = (next: Record<number, SetRow[]>) => onChange({ ...values, rows: next });
  // ručné pridanie cviku počas tréningu (len názov, nie z knižnice) — `addingAt` = pozícia
  // v poradí, za ktorú sa nový cvik vloží (malé „+ cvik“ medzi cvikmi / za posledným)
  const [addingAt, setAddingAt] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newTimed, setNewTimed] = useState(false);
  // Ťuk na tlačidlo formulára nesmie zobrať fokus poľu názvu: na mobile by sa po blur
  // vrátilo spodné menu (skryté pri klávesnici) a prekrylo tlačidlo — ťuk by skončil v menu.
  const keepFocus = (e: MouseEvent) => e.preventDefault();
  const closeAdd = () => {
    setAddingAt(null);
    setNewName("");
    setNewTimed(false);
  };

  // pridať a vyplniť v jednom kroku: po pridaní kurzor rovno do prvej série nového cviku
  const [focusExIdx, setFocusExIdx] = useState<number | null>(null);
  useEffect(() => {
    if (focusExIdx === null) return;
    const block = document.querySelector<HTMLElement>(`[data-ex-idx="${focusExIdx}"]`);
    if (!block) return;
    setFocusExIdx(null);
    block.scrollIntoView({ block: "center", behavior: "smooth" });
    // až po zatvorení okna „Pridať cvik“ — to vracia fokus na „+ cvik“ (BuilderDialog, mikroúloha).
    // Bez upratania: setFocusExIdx(null) hneď prekreslí a cleanup by časovač zrušil.
    window.setTimeout(() => block.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true }), 0);
  }, [focusExIdx, exercises.length]);

  /** nový cvik za pozíciu `pos` v poradí zobrazenia (index cviku = na koniec zoznamu) */
  const addExercise = () => {
    const name = newName.trim().slice(0, ADDED_NAME_MAX);
    if (!name || addingAt === null) return;
    const at = exercises.length;
    const pos = Math.min(addingAt, order.length - 1);
    onChange({
      ...values,
      added: [...added, newTimed ? { name, timed: true } : { name }],
      rows: { ...rows, [at]: Array.from({ length: ADDED_SETS }, () => ({ reps: "", weight: "" })) },
      order: [...order.slice(0, pos + 1), at, ...order.slice(pos + 1)],
      ...(values.supersets && { supersets: [...supersets, null] }),
    });
    closeAdd();
    setFocusExIdx(at);
  };
  const removeExercise = (exIdx: number) => {
    const addedIdx = exIdx - planExercises.length;
    if (addedIdx < 0) return; // cviky plánu sa neodoberajú — nezapísaný cvik sa jednoducho neuloží
    onChange({
      ...values,
      added: added.filter((_, i) => i !== addedIdx),
      rows: dropIndex(rows, exIdx),
      notes: dropIndex(notes, exIdx),
      checked: dropIndex(checked, exIdx),
      collapsed: collapsed.filter((i) => i !== exIdx).map((i) => (i > exIdx ? i - 1 : i)),
      order: order.filter((i) => i !== exIdx).map((i) => (i > exIdx ? i - 1 : i)),
      // odobraný člen supersérie — skupina s jedným cvikom zanikne (upratanie v effectiveSupersets)
      supersets: supersets.filter((_, i) => i !== exIdx),
    });
  };
  /** spojenie počas tréningu: cvik na pozícii `pos` + nasledujúci do supersérie / rozdelenie */
  const toggleSuperset = (pos: number) => {
    const ordered = toggleLinkWithNext(
      order.map((i) => ({ superset: supersets[i] })),
      pos,
    ).map((x) => x.superset ?? null);
    const byIndex: (string | null)[] = exercises.map(() => null);
    order.forEach((i, p) => {
      byIndex[i] = ordered[p];
    });
    onChange({ ...values, supersets: byIndex });
  };
  /** zbalenie / rozbalenie cviku (po odcvičení si ho klient schová) */
  const toggleCollapsed = (exIdx: number) =>
    onChange({
      ...values,
      collapsed: collapsed.includes(exIdx) ? collapsed.filter((i) => i !== exIdx) : [...collapsed, exIdx],
    });
  /** odškrtnutie série (postup na krúžku karty Dnes) */
  const toggleCheck = (exIdx: number, rowIdx: number) => {
    const list = [...(checked[exIdx] ?? [])];
    list[rowIdx] = !list[rowIdx];
    onChange({ ...values, checked: { ...checked, [exIdx]: list } });
  };

  const updateRow = (exIdx: number, rowIdx: number, field: keyof SetRow, value: string) => {
    const next = [...(rows[exIdx] ?? [])];
    next[rowIdx] = { ...next[rowIdx], [field]: value };
    setRows({ ...rows, [exIdx]: next });
  };
  // nová séria s hodnotami trénera (ako riadky na začiatku tréningu)
  const addRow = (exIdx: number) =>
    setRows({ ...rows, [exIdx]: [...(rows[exIdx] ?? []), plannedSetRow(exercises[exIdx])] });
  const removeRow = (exIdx: number, rowIdx: number) =>
    onChange({
      ...values,
      rows: { ...rows, [exIdx]: (rows[exIdx] ?? []).filter((_, i) => i !== rowIdx) },
      checked: { ...checked, [exIdx]: (checked[exIdx] ?? []).filter((_, i) => i !== rowIdx) },
    });

  /** formulár nového cviku priamo na mieste, kam sa vloží (názov + opakovania / čas) */
  const renderAddForm = () => (
    <div className={`${styles.addExerciseForm} ${styles.addExerciseInDialog}`}>
      {addingAt !== null && exercises[order[addingAt]] && (
        <p className={styles.addExerciseWhere}>
          {addingAt < order.length - 1
            ? t("addExerciseWhere", { name: exercises[order[addingAt]].name })
            : t("addExerciseWhereEnd")}
        </p>
      )}
      <input
        type="text"
        className={styles.logNoteInput}
        autoFocus
        autoComplete="off"
        maxLength={ADDED_NAME_MAX}
        placeholder={t("addExercisePlaceholder")}
        aria-label={t("addExerciseAria")}
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        onKeyDown={(e) => {
          // Enter nesmie odoslať formulár „Ukončiť tréning“
          if (e.key === "Enter") {
            e.preventDefault();
            addExercise();
          } else if (e.key === "Escape") {
            closeAdd();
          }
        }}
      />
      {/* meria sa opakovaniami, alebo časom (statický hold, plank…) */}
      <div className={styles.modeToggle} role="radiogroup" aria-label={tl("repsMode.aria")}>
        {([false, true] as const).map((timedOpt) => (
          <button
            key={String(timedOpt)}
            type="button"
            role="radio"
            aria-checked={newTimed === timedOpt}
            className={newTimed === timedOpt ? styles.modeOn : undefined}
            onMouseDown={keepFocus}
            onClick={() => setNewTimed(timedOpt)}
          >
            {tl(timedOpt ? "repsMode.time" : "repsMode.reps")}
          </button>
        ))}
      </div>
      <div className={styles.addExerciseActions}>
        <button type="button" className={styles.swBtnGhost} onMouseDown={keepFocus} onClick={closeAdd}>
          {t("cancel")}
        </button>
        <button
          type="button"
          className={styles.swBtnPrimary}
          onMouseDown={keepFocus}
          onClick={addExercise}
          disabled={!newName.trim()}
        >
          {t("addExerciseConfirm")}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {order.map((exIdx, pos) => {
        const ex = exercises[exIdx];
        const timed = isTimedExercise(ex);
        const plannedSecs = timedSeconds(ex.plannedReps);
        const ss = ssPositions[pos];
        const nextIdx = order[pos + 1];
        const next = nextIdx === undefined ? undefined : exercises[nextIdx];
        const linked = nextIdx !== undefined && Boolean(supersets[exIdx]) && supersets[exIdx] === supersets[nextIdx];
        const isLast = pos === order.length - 1;
        const isCollapsed = checkable && collapsed.includes(exIdx);
        const setsTotal = (rows[exIdx] ?? []).length;
        const setsDone = Array.from({ length: setsTotal }, (_, k) => checked[exIdx]?.[k] === true).filter(Boolean).length;
        return (
          <Fragment key={`${ex.idx}-${exIdx}`}>
          {ss?.first && (
            <p className={styles.logSsHead}>
              {t("ssHeader", {
                letter: ss.letter,
                order: Array.from({ length: ss.size }, (_, k) => `${ss.letter}${k + 1}`).join(" → "),
              })}
            </p>
          )}
          <div
            className={`${styles.logExercise} ${ss ? styles.logExerciseSs : ""} ${isCollapsed ? styles.logExerciseCollapsed : ""}`}
            data-superset={ss ? `${ss.letter}${ss.index}` : undefined}
            data-tour={exIdx < planExercises.length ? "workout-exercise" : undefined}
            data-added={exIdx >= planExercises.length ? "" : undefined}
            data-ex-idx={exIdx}
          >
            <div className={styles.logExerciseHead}>
              <p className={styles.logExerciseName}>
                {ss && <span className={styles.logSsTag}>{`${ss.letter}${ss.index}`}</span>}
                {ex.name}
                {exIdx >= planExercises.length && (
                  <>
                    {" "}
                    <span className={styles.addedTag}>{t("addedTag")}</span>
                  </>
                )}
              </p>
              <span className={styles.logExerciseTools}>
                {exIdx >= planExercises.length && !isCollapsed && (
                  <button
                    type="button"
                    className={styles.setRemove}
                    onClick={() => removeExercise(exIdx)}
                    aria-label={t("removeExercise", { name: ex.name })}
                  >
                    <CloseIcon />
                  </button>
                )}
                {checkable && (
                  // šípka nadol: po odcvičení si klient cvik schová (zbalený ukáže len súhrn sérií)
                  <button
                    type="button"
                    className={`${styles.logCollapseBtn} ${isCollapsed ? styles.logCollapseBtnClosed : ""}`}
                    onClick={() => toggleCollapsed(exIdx)}
                    aria-expanded={!isCollapsed}
                    aria-label={t(isCollapsed ? "expandExercise" : "collapseExercise", { name: ex.name })}
                  >
                    <ChevronDownIcon />
                  </button>
                )}
              </span>
            </div>
            {isCollapsed ? (
              <p className={styles.logCollapsedSummary} data-testid="collapsed-summary">
                {setsDone === setsTotal && setsTotal > 0 && <CheckIcon />}
                {t("collapsedSummary", { done: setsDone, total: setsTotal })}
              </p>
            ) : (
              <>
            {/* poznámka k cviku z plánu (v dátach `tempo`) — počas tréningu po ruke */}
            {exIdx < planExercises.length && ex.tempo && <p className={styles.logExerciseNote}>„{ex.tempo}“</p>}
            <div className={styles.logRows}>
              {(rows[exIdx] ?? []).map((row, rowIdx) => {
                const repsErr = parseReps(row.reps).error;
                const weightErr = parseWeight(row.weight).error;
                const rowErr = showInvalid ? (repsErr ?? weightErr) : null;
                return (
                  <div key={rowIdx}>
                    <div className={styles.setRow}>
                      {checkable ? (
                        // číslo série = odškrtnutie (odcvičená séria → krúžok na karte Dnes)
                        <button
                          type="button"
                          className={`${styles.setCheck} ${checked[exIdx]?.[rowIdx] ? styles.setCheckOn : ""}`}
                          aria-pressed={checked[exIdx]?.[rowIdx] === true}
                          aria-label={t("setDoneAria", { name: ex.name, n: rowIdx + 1 })}
                          onClick={() => toggleCheck(exIdx, rowIdx)}
                          data-set-check
                        >
                          {checked[exIdx]?.[rowIdx] ? <CheckIcon /> : rowIdx + 1}
                        </button>
                      ) : (
                        <span className={styles.setNum}>{rowIdx + 1}</span>
                      )}
                      <label className={`${styles.setField} ${showInvalid && repsErr ? styles.setFieldInvalid : ""}`}>
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder={timed ? (plannedSecs != null ? String(plannedSecs) : t("secondsPlaceholder")) : (ex.plannedReps ?? t("repsPlaceholder"))}
                          aria-label={t(timed ? "secondsAria" : "repsAria", { name: ex.name, n: rowIdx + 1 })}
                          aria-invalid={showInvalid && repsErr ? true : undefined}
                          value={row.reps}
                          onChange={(e) => updateRow(exIdx, rowIdx, "reps", e.target.value)}
                        />
                        <span>{timed ? "s" : "op."}</span>
                      </label>
                      <label className={`${styles.setField} ${showInvalid && weightErr ? styles.setFieldInvalid : ""}`}>
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder={weightPlaceholder(ex.loadKg, locale)}
                          aria-label={t("weightAria", { name: ex.name, n: rowIdx + 1 })}
                          aria-invalid={showInvalid && weightErr ? true : undefined}
                          value={row.weight}
                          onChange={(e) => updateRow(exIdx, rowIdx, "weight", e.target.value)}
                        />
                        <span>kg</span>
                      </label>
                      <button
                        type="button"
                        className={styles.setRemove}
                        onClick={() => removeRow(exIdx, rowIdx)}
                        aria-label={t("removeSet")}
                      >
                        <CloseIcon />
                      </button>
                    </div>
                    {rowErr && (
                      <p className={styles.setError}>
                        {tl(`setInput.${rowErr}`, { max: rowErr === "repsMax" ? REPS_MAX : WEIGHT_MAX_KG })}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className={styles.logExerciseActions}>
              <button type="button" className={styles.addSetBtn} onClick={() => addRow(exIdx)}>
                <PlusIcon /> {t("addSet")}
              </button>
              {notes[exIdx] === undefined && (
                <button
                  type="button"
                  className={styles.addSetBtn}
                  onClick={() => onChange({ ...values, notes: { ...notes, [exIdx]: "" } })}
                >
                  <PlusIcon /> {t("note")}
                </button>
              )}
            </div>
            {notes[exIdx] !== undefined && (
              <textarea
                className={styles.logNoteInput}
                rows={2}
                maxLength={500}
                placeholder={t("notePlaceholder")}
                aria-label={t("noteAria", { name: ex.name })}
                value={notes[exIdx]}
                onChange={(e) => onChange({ ...values, notes: { ...notes, [exIdx]: e.target.value } })}
              />
            )}
              </>
            )}
          </div>
          {/* medzi cvikmi: spojenie do supersérie (len tento tréning) a malé „+ cvik“, ktoré
              vloží nový cvik práve sem; za posledným cvikom len „+ cvik“ */}
          <div className={styles.logBetween}>
            {next && (
              <SupersetLink
                linked={linked}
                label={linked ? t("ssUnlink") : t("ssLink")}
                ariaLabel={linked ? t("ssUnlinkAria", { a: ex.name, b: next.name }) : t("ssLinkAria", { a: ex.name, b: next.name })}
                onToggle={() => toggleSuperset(pos)}
              />
            )}
            <button
              type="button"
              className={styles.logAddBtn}
              onClick={() => {
                setAddingAt(pos);
                setNewName("");
                setNewTimed(false);
              }}
              aria-label={next ? t("addExerciseBetweenAria", { a: ex.name, b: next.name }) : t("addExerciseEndAria")}
              data-tour={isLast ? "workout-add-exercise" : undefined}
            >
              <PlusIcon /> {t("addExerciseShort")}
            </button>
          </div>
          </Fragment>
        );
      })}

      {/* nový cvik cez okno; vloží sa za cvik, pri ktorom klient ťukol „+ cvik“ */}
      {addingAt !== null && (
        <BuilderDialog title={t("addExerciseTitle")} closeLabel={t("addExerciseClose")} onClose={closeAdd}>
          {renderAddForm()}
        </BuilderDialog>
      )}

      <div className={styles.logSessionMeta} data-tour="workout-meta">
        <label className={styles.logRpeField}>
          <span>{t("rpe")}</span>
          <select value={rpe} onChange={(e) => onChange({ ...values, rpe: e.target.value })}>
            <option value="">—</option>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
                {n === 1 ? t("rpeEasy") : n === 10 ? t("rpeMax") : ""}
              </option>
            ))}
          </select>
        </label>
        <textarea
          className={styles.logNoteInput}
          rows={2}
          maxLength={1000}
          placeholder={t("sessionPlaceholder")}
          aria-label={t("sessionAria")}
          value={sessionNote}
          onChange={(e) => onChange({ ...values, sessionNote: e.target.value })}
        />
      </div>
    </>
  );
}
