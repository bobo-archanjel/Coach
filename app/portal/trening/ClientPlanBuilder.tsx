"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import type { ExerciseOption, PortalExercise, PortalPlan, PortalTemplate } from "@/lib/portal/types";
import { saveClientPlanAction, getExerciseDetailAction, type PlanDraft } from "./actions";
import type { ExerciseDetail } from "@/lib/exercises";
import { ExerciseThumb } from "@/app/components/ExerciseThumb";
import { ClientExerciseLibrary } from "./ClientExerciseLibrary";
import b from "@/app/components/workoutBuilder.module.css";
import styles from "../portal.module.css";
import { EmptyDayCard } from "@/app/components/EmptyDayCard";
import { useActiveTabInView } from "@/app/components/useActiveTabInView";
import { BuilderDialog } from "@/app/components/BuilderDialog";
import dlg from "@/app/components/builderDialog.module.css";

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
};
type BDay = { key: string; id: string | null; name: string; exercises: BEx[] };

const BackIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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

// Rovnaké defaulty ako trénerov "Pridať do tréningu" (3×10, pauza 90 s).
function newExercise(name: string, exerciseId: string | null): BEx {
  return { key: uid(), exerciseId, name, sets: "3", reps: "10", loadKg: "", restSeconds: "90" };
}

/** Dni pre rozpracovaný tréning — z upravovaného plánu (dni s id → úprava) alebo
    zo šablóny (bez id → úplne nový tréning, nové entry_id). */
function toDraftDays(days: { id?: string; name: string; exercises: PortalExercise[] }[]): BDay[] {
  return days.map((d) => ({
    key: uid(),
    id: d.id ?? null,
    name: d.name,
    exercises: d.exercises.map((e) => ({
      key: uid(),
      entryId: d.id ? (e.entryId ?? undefined) : undefined,
      exerciseId: e.exerciseId,
      name: e.name,
      sets: String(e.plannedSets),
      reps: e.plannedReps ?? "10",
      loadKg: e.loadKg != null ? String(e.loadKg) : "",
      restSeconds: e.restSeconds != null ? String(e.restSeconds) : "",
    })),
  }));
}

export function ClientPlanBuilder({
  library,
  initial,
  template = null,
  onCancel,
  onSaved,
}: {
  library: ExerciseOption[];
  initial: PortalPlan | null;
  /** "Použiť" pri šablóne — nový tréning predvyplnený jej obsahom (uloží sa ako nový, šablóna ostane) */
  template?: PortalTemplate | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("clientBuilder");
  const [name, setName] = useState(initial?.name ?? template?.name ?? "");
  const [days, setDays] = useState<BDay[]>(() => toDraftDays(initial?.days ?? template?.days ?? []));
  // "" = ešte nevybraný → activeDay spadne na prvý deň (nižšie).
  const [activeKey, setActiveKey] = useState<string>("");
  // Nový prázdny tréning začína bez dní (ako u trénera) — „+ deň“ v dráhe otvorí okno
  // s názvom dňa (nie predvyplnený "Deň 1"). Okno sa samo neotvára, prvé je pole s názvom tréningu.
  const [addingDay, setAddingDay] = useState(false);
  const [dayName, setDayName] = useState("");
  const [dayError, setDayError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // „Premenovať“ aktívny deň (lokálne, do DB až „Uložiť“) — null = zatvorené
  const [renameValue, setRenameValue] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
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
  const tabsRef = useRef<HTMLDivElement>(null);
  useActiveTabInView(tabsRef, realActiveKey);

  // Prepnutie dňa zahodí rozpracované potvrdenie zmazania (u trénera key na DeleteDayControl).
  const selectDay = (key: string) => {
    setActiveKey(key);
    setConfirmDelete(false);
    setRenameValue(null);
  };

  // Esc = zrušiť potvrdenie zmazania dňa aj premenovanie.
  const renaming = renameValue !== null;
  useEffect(() => {
    if (!confirmDelete && !renaming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setConfirmDelete(false);
      setRenameValue(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmDelete, renaming]);

  const patchDay = (key: string, fn: (d: BDay) => BDay) =>
    setDays((prev) => prev.map((d) => (d.key === key ? fn(d) : d)));

  const patchExercise = (dayKey: string, exKey: string, patch: Partial<BEx>) =>
    patchDay(dayKey, (d) => ({
      ...d,
      exercises: d.exercises.map((e) => (e.key === exKey ? { ...e, ...patch } : e)),
    }));

  const addDay = () => {
    const trimmed = dayName.trim();
    if (!trimmed) {
      setDayError(t("dayNameRequired"));
      return;
    }
    if (days.length >= MAX_DAYS) {
      setDayError(t("maxDays", { max: MAX_DAYS }));
      return;
    }
    const d: BDay = { key: uid(), id: null, name: trimmed, exercises: [] };
    setDays((prev) => [...prev, d]);
    selectDay(d.key);
    setDayName("");
    setDayError(null);
    setAddingDay(false);
    if (error === t("addDayRequired")) setError(null);
  };
  const closeAddDay = () => {
    setAddingDay(false);
    setDayName("");
    setDayError(null);
  };
  const removeDay = (key: string) => {
    setDays((prev) => prev.filter((d) => d.key !== key));
    selectDay("");
  };
  const renameDay = (key: string) => {
    const trimmed = (renameValue ?? "").trim();
    if (!trimmed) {
      setRenameError(t("dayNameRequired"));
      return;
    }
    patchDay(key, (d) => ({ ...d, name: trimmed }));
    setRenameValue(null);
    setRenameError(null);
  };
  /** „Duplikovať“ (ako v jedálničku trénera): kópia dňa aj s cvikmi na koniec, prepne sa na ňu.
      Nový deň aj cviky bez id — server im pri „Uložiť“ pridelí nové (ako pri šablóne). */
  const duplicateDay = (key: string) => {
    const src = days.find((d) => d.key === key);
    if (!src || days.length >= MAX_DAYS) return;
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
    if (activeDay.exercises.length >= MAX_EXERCISES) return t("maxExercises", { max: MAX_EXERCISES });
    patchDay(activeDay.key, (d) => ({ ...d, exercises: [...d.exercises, newExercise(exName, exerciseId)] }));
    return null;
  };
  const removeExercise = (dayKey: string, exKey: string) =>
    patchDay(dayKey, (d) => ({ ...d, exercises: d.exercises.filter((e) => e.key !== exKey) }));
  const moveExercise = (dayKey: string, exKey: string, direction: "up" | "down") =>
    patchDay(dayKey, (d) => {
      const i = d.exercises.findIndex((e) => e.key === exKey);
      const j = direction === "up" ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= d.exercises.length) return d;
      const exercises = [...d.exercises];
      [exercises[i], exercises[j]] = [exercises[j], exercises[i]];
      return { ...d, exercises };
    });

  const save = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t("planNameRequired"));
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
          })),
      })),
    };
    setError(null);
    startTransition(async () => {
      const res = await saveClientPlanAction(JSON.stringify(draft), initial?.id);
      if (res.error) setError(res.error);
      else onSaved();
    });
  };

  return (
    <section aria-label={initial ? t("editAria") : t("newAria")} className={styles.trWrap}>
      <div className={styles.trBuilderTop}>
        <button type="button" className={styles.trBackBtn} onClick={onCancel} disabled={pending}>
          <BackIcon /> {t("back")}
        </button>
        <button type="button" className={styles.trSaveBtn} onClick={save} disabled={pending}>
          {pending ? t("saving") : t("save")}
        </button>
      </div>

      <label className={styles.trNameField}>
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
        />
      </label>

      <div className={`${b.builderGrid} ${styles.trBuilderGrid}`}>
        <div className={`${b.canvas} ${styles.trBuilderCanvas}`}>
          {/* Výber dňa = prepínač (dráha), nie tlačidlá; počet cvikov je len vizuálny (aria-hidden) */}
          <div ref={tabsRef} className={b.dayTabs} role="group" aria-label={t("daysAria")} data-no-swipe>
            {days.map((d) => (
              <button
                key={d.key}
                type="button"
                className={`${b.dayTab} ${d.key === realActiveKey ? b.dayTabActive : ""}`}
                onClick={() => selectDay(d.key)}
                aria-current={d.key === realActiveKey ? "true" : undefined}
                title={d.name}
              >
                <span className={b.dayTabName}>{d.name}</span>
                <span className={b.dayTabCount} aria-hidden="true">
                  {d.exercises.length}
                </span>
              </button>
            ))}
            <button
              type="button"
              className={b.addDayTab}
              onClick={() => {
                setAddingDay(true);
                setRenameValue(null);
              }}
            >
              {t("addDay")}
            </button>
          </div>

          {addingDay && (
            <BuilderDialog title={t("newDayTitle")} closeLabel={t("close")} onClose={closeAddDay}>
              <form
                className={dlg.form}
                onSubmit={(e) => {
                  e.preventDefault();
                  addDay();
                }}
              >
                {/* deň plánu = jeden tréning (napr. "Deň 1 — Push") */}
                <div className={dlg.field}>
                  <label htmlFor="client-day-name" className={dlg.label}>
                    {t("dayName")}
                  </label>
                  <input
                    id="client-day-name"
                    type="text"
                    value={dayName}
                    onChange={(e) => {
                      setDayName(e.target.value);
                      if (dayError) setDayError(null);
                    }}
                    placeholder={t("dayPlaceholder", { n: days.length + 1 })}
                    maxLength={60}
                    autoFocus
                    className={dlg.input}
                  />
                </div>
                {dayError && (
                  <p className={dlg.error} role="alert">
                    {dayError}
                  </p>
                )}
                <div className={dlg.actions}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={closeAddDay}>
                    {t("cancel")}
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm">
                    {t("add")}
                  </button>
                </div>
              </form>
            </BuilderDialog>
          )}

          {activeDay &&
            (renaming ? (
              <form
                className={`${b.addDayForm} ${styles.trAddDayForm}`}
                onSubmit={(e) => {
                  e.preventDefault();
                  renameDay(activeDay.key);
                }}
              >
                <label htmlFor="client-day-rename" className={`${styles.panelLabel} ${styles.trDayNameLabel}`}>
                  {t("dayName")}
                </label>
                <input
                  id="client-day-rename"
                  type="text"
                  value={renameValue ?? ""}
                  onChange={(e) => {
                    setRenameValue(e.target.value);
                    if (renameError) setRenameError(null);
                  }}
                  maxLength={60}
                  autoFocus
                  className={b.addDayInput}
                />
                <button type="submit" className="btn btn-primary btn-sm">
                  {t("done")}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setRenameValue(null);
                    setRenameError(null);
                  }}
                >
                  {t("cancel")}
                </button>
                {renameError && <p className={b.formError}>{renameError}</p>}
              </form>
            ) : (
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
                          setRenameValue(activeDay.name);
                          setRenameError(null);
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
            ))}

          <div className={b.dayPanel}>
            {activeDay ? (
              activeDay.exercises.length > 0 ? (
                activeDay.exercises.map((ex, i) =>
                  editKey === ex.key ? (
                    <ExerciseEditForm
                      key={ex.key}
                      ex={ex}
                      onApply={(patch) => {
                        patchExercise(activeDay.key, ex.key, patch);
                        setEditKey(null);
                      }}
                      onCancel={() => setEditKey(null)}
                    />
                  ) : (
                    <div key={ex.key} className={b.exerciseRow}>
                      {ex.exerciseId ? (
                        <button type="button" className={b.exerciseNameBtn} onClick={() => openDetail(ex.exerciseId!, ex.name)}>
                          <ExerciseThumb src={library.find((l) => l.id === ex.exerciseId)?.imageUrl ?? null} alt="" size={26} />
                          <span className={b.exerciseName}>{ex.name}</span>
                        </button>
                      ) : (
                        <div className={b.exerciseNameStatic}>
                          <ExerciseThumb src={null} alt="" size={26} />
                          <span className={b.exerciseName}>{ex.name}</span>
                        </div>
                      )}
                      <span className={b.exerciseSummary}>
                        {ex.sets || "3"}× {ex.reps || "10"}
                        {ex.loadKg.trim() ? ` @ ${ex.loadKg} kg` : ""}
                      </span>
                      {ex.restSeconds.trim() && <span className={b.exerciseMeta}>{t("restValue", { seconds: ex.restSeconds })}</span>}
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
                  ),
                )
              ) : (
                <EmptyDayCard title={t("noExercises")} tip={{ title: t("howToAdd"), text: t("howToAddText") }} />
              )
            ) : (
              <EmptyDayCard title={t("noDays")} text={t("noDaysText")} />
            )}
          </div>
        </div>

        {/* Až za plátnom aj v DOM — poradie pre klávesnicu/čítačku = vizuálne */}
        <ClientExerciseLibrary
          library={library}
          hasDay={activeDay !== null}
          onAdd={addExercise}
          onDetail={openDetail}
        />
      </div>

      {error && (
        <p className={styles.trError} role="alert">
          {error}
        </p>
      )}

      <button type="button" className={`btn btn-primary ${styles.startBtn}`} onClick={save} disabled={pending}>
        {pending ? t("saving") : initial ? t("saveChanges") : t("saveWorkout")}
      </button>

      {detailFor && (
        <ExerciseDetailModal detail={detail} fallbackName={detailFor.name} onClose={() => setDetailFor(null)} />
      )}
    </section>
  );
}

/** Úprava cviku — rovnaký formulár ako u trénera (ExerciseRow), mení len rozpracovaný tréning. */
function ExerciseEditForm({
  ex,
  onApply,
  onCancel,
}: {
  ex: BEx;
  onApply: (patch: Pick<BEx, "sets" | "reps" | "loadKg" | "restSeconds">) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("clientBuilder");
  return (
    <form
      className={b.editForm}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const val = (k: string) => String(f.get(k) ?? "").trim();
        onApply({ sets: val("sets"), reps: val("reps"), loadKg: val("load_kg"), restSeconds: val("rest_seconds") });
      }}
    >
      <span className={b.editName}>{ex.name}</span>
      <div className={b.editGrid}>
        <label className={`${b.editField} ${b.editFieldSets}`}>
          <span className={b.editFieldLabel}>{t("sets")}</span>
          <input name="sets" type="number" inputMode="numeric" min={1} max={20} defaultValue={ex.sets} required />
        </label>
        <label className={`${b.editField} ${b.editFieldReps}`}>
          <span className={b.editFieldLabel}>{t("reps")}</span>
          <input name="reps" type="text" maxLength={20} defaultValue={ex.reps} placeholder="10 / 8-12 / 30 s" required />
        </label>
        <label className={`${b.editField} ${b.editFieldLoad}`}>
          <span className={b.editFieldLabel}>{t("load")}</span>
          <input name="load_kg" type="number" inputMode="decimal" step="0.5" min={0} defaultValue={ex.loadKg} placeholder="—" />
        </label>
        <label className={`${b.editField} ${b.editFieldRest}`}>
          <span className={b.editFieldLabel}>{t("rest")}</span>
          <input name="rest_seconds" type="number" inputMode="numeric" min={0} defaultValue={ex.restSeconds} placeholder="—" />
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
