"use client";

import { useMemo, useState, useTransition } from "react";
import type { ExerciseOption, PortalPlan } from "@/lib/portal/types";
import { saveClientPlanAction, type PlanDraft } from "./actions";
import styles from "../portal.module.css";

/* Builder vlastného tréningu klienta — plne klientský draft, uloží sa jedným
   ťukom na "Uložiť". Naklikanie cvikov ako u trénera: výber z globálnej knižnice
   alebo voľný text. Používa sa aj na úpravu existujúceho vlastného plánu (initial). */

function uid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `k${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}

type BEx = {
  key: string;
  entryId?: string;
  exerciseId: string | null;
  name: string;
  sets: string;
  reps: string;
  loadKg: string;
  tempo: string;
  restSeconds: string;
};
type BDay = { key: string; id: string | null; name: string; exercises: BEx[] };

const BackIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const PlusIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);
const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function newExercise(name: string, exerciseId: string | null): BEx {
  return { key: uid(), exerciseId, name, sets: "3", reps: "10", loadKg: "", tempo: "", restSeconds: "90" };
}

function fromInitial(initial: PortalPlan): BDay[] {
  return initial.days.map((d) => ({
    key: uid(),
    id: d.id,
    name: d.name,
    exercises: d.exercises.map((e) => ({
      key: uid(),
      entryId: e.entryId ?? undefined,
      exerciseId: e.exerciseId,
      name: e.name,
      sets: String(e.plannedSets),
      reps: e.plannedReps ?? "10",
      loadKg: e.loadKg != null ? String(e.loadKg) : "",
      tempo: e.tempo ?? "",
      restSeconds: e.restSeconds != null ? String(e.restSeconds) : "",
    })),
  }));
}

export function ClientPlanBuilder({
  library,
  initial,
  onCancel,
  onSaved,
}: {
  library: ExerciseOption[];
  initial: PortalPlan | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [days, setDays] = useState<BDay[]>(() =>
    initial ? fromInitial(initial) : [{ key: uid(), id: null, name: "Deň 1", exercises: [] }],
  );
  // "" = ešte nevybraný → activeDay spadne na prvý deň (nižšie).
  const [activeKey, setActiveKey] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [editKey, setEditKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // activeKey init sa vyhodnotí len raz — ak je prázdny, spadni na prvý deň.
  const activeDay = days.find((d) => d.key === activeKey) ?? days[0] ?? null;
  const realActiveKey = activeDay?.key ?? "";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? library.filter((e) => e.name.toLowerCase().includes(q) || e.muscleGroup?.toLowerCase().includes(q))
      : library;
    return base.slice(0, 40);
  }, [library, query]);

  const patchDay = (key: string, fn: (d: BDay) => BDay) =>
    setDays((prev) => prev.map((d) => (d.key === key ? fn(d) : d)));

  const patchExercise = (dayKey: string, exKey: string, patch: Partial<BEx>) =>
    patchDay(dayKey, (d) => ({
      ...d,
      exercises: d.exercises.map((e) => (e.key === exKey ? { ...e, ...patch } : e)),
    }));

  const addDay = () => {
    const d: BDay = { key: uid(), id: null, name: `Deň ${days.length + 1}`, exercises: [] };
    setDays((prev) => [...prev, d]);
    setActiveKey(d.key);
  };
  const removeDay = (key: string) => {
    setDays((prev) => {
      const next = prev.filter((d) => d.key !== key);
      if (next.length === 0) return [{ key: uid(), id: null, name: "Deň 1", exercises: [] }];
      return next;
    });
  };

  const addExercise = (name: string, exerciseId: string | null) => {
    if (!realActiveKey || !name.trim()) return;
    const ex = newExercise(name.trim(), exerciseId);
    patchDay(realActiveKey, (d) => ({ ...d, exercises: [...d.exercises, ex] }));
    setEditKey(ex.key);
    setPickerOpen(false);
    setQuery("");
  };
  const removeExercise = (dayKey: string, exKey: string) =>
    patchDay(dayKey, (d) => ({ ...d, exercises: d.exercises.filter((e) => e.key !== exKey) }));

  const save = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Zadaj názov tréningu.");
      return;
    }
    if (days.some((d) => !d.name.trim())) {
      setError("Každý deň potrebuje názov.");
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
            tempo: e.tempo.trim() || null,
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

  const canAddCustom =
    query.trim().length > 0 && !library.some((e) => e.name.toLowerCase() === query.trim().toLowerCase());

  return (
    <section aria-label={initial ? "Úprava vlastného tréningu" : "Nový vlastný tréning"} className={styles.trWrap}>
      <div className={styles.trBuilderTop}>
        <button type="button" className={styles.trBackBtn} onClick={onCancel} disabled={pending}>
          <BackIcon /> Späť
        </button>
        <button type="button" className={styles.trSaveBtn} onClick={save} disabled={pending}>
          {pending ? "Ukladám…" : "Uložiť"}
        </button>
      </div>

      <label className={styles.trNameField}>
        <span className={styles.panelLabel}>Názov tréningu</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="napr. Horná časť tela"
          maxLength={60}
          className={styles.trNameInput}
        />
      </label>

      <div className={styles.trDayTabs}>
        {days.map((d) => (
          <button
            key={d.key}
            type="button"
            className={`${styles.trDayTab} ${d.key === realActiveKey ? styles.trDayTabOn : ""}`}
            onClick={() => setActiveKey(d.key)}
          >
            {d.name || "Deň"}
          </button>
        ))}
        <button type="button" className={styles.trAddDayTab} onClick={addDay}>
          <PlusIcon /> deň
        </button>
      </div>

      {activeDay && (
        <div className={styles.trBuilderPanel}>
          <div className={styles.trDayNameRow}>
            <input
              type="text"
              value={activeDay.name}
              onChange={(e) => patchDay(activeDay.key, (d) => ({ ...d, name: e.target.value }))}
              placeholder="Názov dňa"
              maxLength={60}
              className={styles.trDayNameInput}
              aria-label="Názov dňa"
            />
            {days.length > 1 && (
              <button
                type="button"
                className={styles.trIconBtn}
                onClick={() => removeDay(activeDay.key)}
                aria-label="Odobrať deň"
              >
                <TrashIcon />
              </button>
            )}
          </div>

          {activeDay.exercises.length === 0 ? (
            <p className={styles.trEmptyDay}>Zatiaľ žiadne cviky. Pridaj prvý nižšie.</p>
          ) : (
            <ol className={styles.trExList}>
              {activeDay.exercises.map((ex, i) => {
                const editing = editKey === ex.key;
                return (
                  <li key={ex.key} className={styles.trExItem}>
                    <div className={styles.trExHead}>
                      <span className={styles.exIdx}>{i + 1}</span>
                      <span className={styles.trExName}>{ex.name}</span>
                      <button
                        type="button"
                        className={styles.trIconBtn}
                        onClick={() => setEditKey(editing ? null : ex.key)}
                        aria-expanded={editing}
                      >
                        {editing ? "Hotovo" : "Upraviť"}
                      </button>
                      <button
                        type="button"
                        className={styles.trIconBtn}
                        onClick={() => removeExercise(activeDay.key, ex.key)}
                        aria-label="Odobrať cvik"
                      >
                        <TrashIcon />
                      </button>
                    </div>

                    {editing ? (
                      <div className={styles.trExEdit}>
                        <label className={styles.trField}>
                          <span>Série</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={20}
                            value={ex.sets}
                            onChange={(e) => patchExercise(activeDay.key, ex.key, { sets: e.target.value })}
                          />
                        </label>
                        <label className={styles.trField}>
                          <span>Opakovania</span>
                          <input
                            type="text"
                            value={ex.reps}
                            onChange={(e) => patchExercise(activeDay.key, ex.key, { reps: e.target.value })}
                            placeholder="10 / 8-12 / 30 s"
                          />
                        </label>
                        <label className={styles.trField}>
                          <span>Záťaž (kg)</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.5"
                            value={ex.loadKg}
                            onChange={(e) => patchExercise(activeDay.key, ex.key, { loadKg: e.target.value })}
                            placeholder="—"
                          />
                        </label>
                        <label className={styles.trField}>
                          <span>Pauza (s)</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            value={ex.restSeconds}
                            onChange={(e) => patchExercise(activeDay.key, ex.key, { restSeconds: e.target.value })}
                            placeholder="—"
                          />
                        </label>
                        <label className={styles.trField}>
                          <span>Tempo</span>
                          <input
                            type="text"
                            value={ex.tempo}
                            onChange={(e) => patchExercise(activeDay.key, ex.key, { tempo: e.target.value })}
                            placeholder="napr. 3-0-1"
                          />
                        </label>
                      </div>
                    ) : (
                      <p className={styles.trExMeta}>
                        {[
                          `${ex.sets || "3"} × ${ex.reps || "10"}`,
                          ex.loadKg.trim() && `${ex.loadKg} kg`,
                          ex.restSeconds.trim() && `pauza ${ex.restSeconds} s`,
                          ex.tempo.trim() && `tempo ${ex.tempo}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          {pickerOpen ? (
            <div className={styles.trPicker}>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Hľadať cvik alebo napísať vlastný…"
                className={styles.trPickerSearch}
                autoFocus
              />
              <div className={styles.trPickerList}>
                {filtered.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    className={styles.trPickerItem}
                    onClick={() => addExercise(e.name, e.id)}
                  >
                    <span>{e.name}</span>
                    {e.muscleGroup && <span className={styles.trPickerMuscle}>{e.muscleGroup}</span>}
                  </button>
                ))}
                {canAddCustom && (
                  <button
                    type="button"
                    className={`${styles.trPickerItem} ${styles.trPickerCustom}`}
                    onClick={() => addExercise(query, null)}
                  >
                    <PlusIcon /> Pridať „{query.trim()}“
                  </button>
                )}
                {filtered.length === 0 && !canAddCustom && (
                  <p className={styles.trEmptyDay}>Začni písať názov cviku.</p>
                )}
              </div>
              <button
                type="button"
                className={styles.trGhostBtn}
                onClick={() => {
                  setPickerOpen(false);
                  setQuery("");
                }}
              >
                Zavrieť
              </button>
            </div>
          ) : (
            <button type="button" className={styles.trAddExBtn} onClick={() => setPickerOpen(true)}>
              <PlusIcon /> Pridať cvik
            </button>
          )}
        </div>
      )}

      {error && (
        <p className={styles.trError} role="alert">
          {error}
        </p>
      )}

      <button type="button" className={`btn btn-primary ${styles.startBtn}`} onClick={save} disabled={pending}>
        {pending ? "Ukladám…" : initial ? "Uložiť zmeny" : "Uložiť tréning"}
      </button>
    </section>
  );
}
