"use client";

import { startTransition, useActionState, useOptimistic } from "react";
import { MEAL_SLOT_LABELS, MEAL_SLOT_ORDER, sumMacros } from "@/lib/meals";
import type { PortalDiaryData, PortalDiaryEntry, PortalDiaryGroup } from "@/lib/portal/types";
import { addFoodLogAction, removeFoodLogAction, type ActionState } from "../actions";
import styles from "../portal.module.css";
import { AddFoodDiaryEntry } from "./AddFoodDiaryEntry";
import { DiaryRow } from "./DiaryRow";

const initialState: ActionState = { error: null };

/** Podiel naplnenia (0–1) — min. viditeľný pruh, keď je nejaká hodnota. */
function fillScale(value: number, goal: number): number {
  const raw = goal > 0 ? Math.min(1, value / goal) : 0;
  return raw > 0 ? Math.max(raw, 0.02) : 0;
}

function MacroBar({ label, value, goal }: { label: string; value: number; goal: number | null }) {
  // Bez cieľa: len label + hodnota, žiadny pruh (inak by 100% coral pôsobilo ako "splnené").
  if (goal == null) {
    return (
      <div className={styles.macroNoGoal}>
        <span className={styles.macroLabel}>{label}</span>
        <span className={styles.macroVal}>{Math.round(value)} g</span>
      </div>
    );
  }
  const over = value > goal;
  return (
    <div className={styles.macro}>
      <span className={styles.macroLabel}>{label}</span>
      <span className={styles.macroTrack}>
        <span
          className={`${styles.macroFill} ${over ? styles.macroOver : ""}`}
          style={{ transform: `scaleX(${fillScale(value, goal)})` }}
        />
      </span>
      <span className={`${styles.macroVal} ${over ? styles.macroOver : ""}`}>
        {Math.round(value)} / {Math.round(goal)} g
      </span>
    </div>
  );
}

type DiaryAction = { type: "add"; entry: PortalDiaryEntry } | { type: "remove"; id: string };

function diaryReducer(entries: PortalDiaryEntry[], action: DiaryAction): PortalDiaryEntry[] {
  if (action.type === "add") return [...entries, action.entry];
  return entries.filter((e) => e.id !== action.id);
}

/** Rovnaké zoskupenie ako getPortalFoodDiary (lib/portal/data.ts) — počíta sa
    znova z (optimistickej) plochej listiny záznamov, nech pridanie/odobratie
    hneď prepočíta aj skupiny podľa jedla dňa aj súčty, nielen samotný riadok. */
function buildGroups(entries: PortalDiaryEntry[]): PortalDiaryGroup[] {
  return MEAL_SLOT_ORDER.map((slot) => {
    const items = entries.filter((e) => e.slot === slot);
    return { slot, slotLabel: MEAL_SLOT_LABELS[slot], entries: items, kcal: sumMacros(items).kcal };
  }).filter((g) => g.entries.length > 0);
}

/**
 * Denník jedla — klientská komponenta (feature/optimalizacia). Predtým bol
 * tento view server component a "pridať"/"odobrať" žili ako dve nezávislé
 * ostrovné komponenty (AddFoodDiaryEntry, DiaryRow), každá s vlastným
 * useActionState — zoznam/súčty sa aktualizovali až po revalidatePath
 * (celý round-trip). Teraz drží zdieľaný `useOptimistic` nad plochým
 * zoznamom záznamov, obe akcie idú cez tento view, takže pridanie/odobratie
 * jedla sa v zozname aj v makro pruhoch prejaví okamžite.
 */
export function DiaryView({ data }: { data: PortalDiaryData }) {
  const { goal, planFoods, hour } = data;

  const [addState, addFormAction, addPending] = useActionState(addFoodLogAction, initialState);
  const [removeState, removeFormAction] = useActionState(removeFoodLogAction, initialState);

  const initialEntries = data.groups.flatMap((g) => g.entries);
  const [entries, dispatchOptimistic] = useOptimistic<PortalDiaryEntry[], DiaryAction>(initialEntries, diaryReducer);

  function handleAdd(fd: FormData, entry: PortalDiaryEntry) {
    startTransition(() => {
      dispatchOptimistic({ type: "add", entry });
      addFormAction(fd);
    });
  }

  function handleRemove(id: string) {
    const fd = new FormData();
    fd.set("entry_id", id);
    startTransition(() => {
      dispatchOptimistic({ type: "remove", id });
      removeFormAction(fd);
    });
  }

  const groups = buildGroups(entries);
  // Súčty vždy prepočítané z (optimistickej) plochej listiny — pri chybe
  // uloženia/odobratia React sám zahodí optimistic vrstvu, `entries` sa vráti
  // na pôvodné dáta zo servera a súčet vyjde rovnako ako predtým počítaný `serverTotals`.
  const totals = sumMacros(entries);
  const kcalGoal = goal?.caloriesTarget ?? null;
  const kcalOver = kcalGoal != null && totals.kcal > kcalGoal;
  const hasEntries = groups.length > 0;

  return (
    <section className={styles.diary} aria-label="Denník jedla">
      <div className={`${styles.panel} ${styles.diaryHero}`}>
        <h1 className={styles.diaryHeading}>Dnešný príjem</h1>
        <div className={styles.kcalLine}>
          <span className={`${styles.diaryKcal} ${kcalOver ? styles.macroOver : ""}`}>{totals.kcal}</span>
          <span className={styles.diaryKcalGoal}>{kcalGoal != null ? `/ ${kcalGoal} kcal` : "kcal spolu"}</span>
        </div>
        {kcalGoal != null && (
          <span className={styles.macroTrack} style={{ marginBottom: 14 }}>
            <span
              className={`${styles.macroFill} ${kcalOver ? styles.macroOver : ""}`}
              style={{ transform: `scaleX(${fillScale(totals.kcal, kcalGoal)})` }}
            />
          </span>
        )}
        <MacroBar label="Bielkoviny" value={totals.proteinG} goal={goal?.proteinG ?? null} />
        <MacroBar label="Sacharidy" value={totals.carbsG} goal={goal?.carbsG ?? null} />
        <MacroBar label="Tuky" value={totals.fatG} goal={goal?.fatG ?? null} />
        {!goal && (
          <p className={styles.diaryMeta} style={{ marginTop: 10 }}>
            Tréner ti zatiaľ nenastavil makro cieľ — zobrazuje sa len súčet zjedeného.
          </p>
        )}
      </div>

      {removeState.error && (
        <p className={styles.addError} role="alert">
          Nepodarilo sa odobrať — {removeState.error}
        </p>
      )}

      {hasEntries ? (
        groups.map((group) => (
          <div key={group.slot} className={styles.panel}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <p className={styles.panelLabel} style={{ marginBottom: 0 }}>
                {group.slotLabel}
              </p>
              <span className={styles.chip}>{group.kcal} kcal</span>
            </div>
            <ul className={styles.diaryList}>
              {group.entries.map((entry) => (
                <DiaryRow key={entry.id} entry={entry} onRemove={handleRemove} />
              ))}
            </ul>
          </div>
        ))
      ) : (
        <div className={styles.panel}>
          <div className={styles.sessionQuiet}>
            <p>Dnes si si ešte nič nezapísal. Pridaj prvé jedlo nižšie.</p>
          </div>
        </div>
      )}

      <AddFoodDiaryEntry planFoods={planFoods} hour={hour} onAdd={handleAdd} pending={addPending} error={addState.error} />
    </section>
  );
}
