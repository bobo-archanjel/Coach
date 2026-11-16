"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, type MouseEvent } from "react";
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

const RemoveIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
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
  const fill = (i: number, match: LoggedExercise, timed: boolean) => {
    used.add(match);
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
  return { rows: base.rows, notes, rpe: rpe != null ? String(rpe) : "", sessionNote: note ?? "", added };
}

/** Série a poznámky na odoslanie (JSON pre finishWorkoutAction / updateWorkoutLogAction). */
export function buildEntriesPayload(planExercises: PortalExercise[], values: WorkoutFormValues) {
  const exercises = formExercises(planExercises, values);
  const summary = summarizeWorkoutForm(exercises.length, values.rows);
  const entries = exercises.map((ex, i) => {
    const sets = summary.sets[i] ?? [];
    return {
      entryId: ex.entryId,
      name: ex.name,
      note: values.notes[i]?.trim() || undefined,
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
}: {
  exercises: PortalExercise[];
  values: WorkoutFormValues;
  onChange: (next: WorkoutFormValues) => void;
  showInvalid: boolean;
}) {
  const t = useTranslations("workout");
  const tl = useTranslations("labels");
  const locale = useLocale();
  const { rows, notes, rpe, sessionNote } = values;
  const added = values.added ?? [];
  const exercises = formExercises(planExercises, values);
  const setRows = (next: Record<number, SetRow[]>) => onChange({ ...values, rows: next });
  // ručné pridanie cviku počas tréningu (len názov, nie z knižnice)
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTimed, setNewTimed] = useState(false);
  // Ťuk na tlačidlo formulára nesmie zobrať fokus poľu názvu: na mobile by sa po blur
  // vrátilo spodné menu (skryté pri klávesnici) a prekrylo tlačidlo — ťuk by skončil v menu.
  const keepFocus = (e: MouseEvent) => e.preventDefault();
  const closeAdd = () => {
    setAdding(false);
    setNewName("");
    setNewTimed(false);
  };

  const addExercise = () => {
    const name = newName.trim().slice(0, ADDED_NAME_MAX);
    if (!name) return;
    const at = exercises.length;
    onChange({
      ...values,
      added: [...added, newTimed ? { name, timed: true } : { name }],
      rows: { ...rows, [at]: Array.from({ length: ADDED_SETS }, () => ({ reps: "", weight: "" })) },
    });
    closeAdd();
  };
  const removeExercise = (exIdx: number) => {
    const addedIdx = exIdx - planExercises.length;
    if (addedIdx < 0) return; // cviky plánu sa neodoberajú — nezapísaný cvik sa jednoducho neuloží
    onChange({
      ...values,
      added: added.filter((_, i) => i !== addedIdx),
      rows: dropIndex(rows, exIdx),
      notes: dropIndex(notes, exIdx),
    });
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
    setRows({ ...rows, [exIdx]: (rows[exIdx] ?? []).filter((_, i) => i !== rowIdx) });

  return (
    <>
      {exercises.map((ex, exIdx) => {
        const timed = isTimedExercise(ex);
        const plannedSecs = timedSeconds(ex.plannedReps);
        return (
          <div
            key={`${ex.idx}-${exIdx}`}
            className={styles.logExercise}
            data-tour={exIdx < planExercises.length ? "workout-exercise" : undefined}
            data-added={exIdx >= planExercises.length ? "" : undefined}
          >
            {exIdx < planExercises.length ? (
              <>
                <p className={styles.logExerciseName}>{ex.name}</p>
                {/* poznámka k cviku z plánu (v dátach `tempo`) — počas tréningu po ruke */}
                {ex.tempo && <p className={styles.logExerciseNote}>„{ex.tempo}“</p>}
              </>
            ) : (
              <div className={styles.logExerciseHead}>
                <p className={styles.logExerciseName}>
                  {ex.name} <span className={styles.addedTag}>{t("addedTag")}</span>
                </p>
                <button
                  type="button"
                  className={styles.setRemove}
                  onClick={() => removeExercise(exIdx)}
                  aria-label={t("removeExercise", { name: ex.name })}
                >
                  <CloseIcon />
                </button>
              </div>
            )}
            <div className={styles.logRows}>
              {(rows[exIdx] ?? []).map((row, rowIdx) => {
                const repsErr = parseReps(row.reps).error;
                const weightErr = parseWeight(row.weight).error;
                const rowErr = showInvalid ? (repsErr ?? weightErr) : null;
                return (
                  <div key={rowIdx}>
                    <div className={styles.setRow}>
                      <span className={styles.setNum}>{rowIdx + 1}</span>
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
                        <RemoveIcon />
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
          </div>
        );
      })}

      <div className={styles.addExercise} data-tour="workout-add-exercise">
        {adding ? (
          <div className={styles.addExerciseForm}>
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
        ) : (
          <button type="button" className={styles.addExerciseBtn} onClick={() => setAdding(true)}>
            <PlusIcon /> {t("addExercise")}
          </button>
        )}
      </div>

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
