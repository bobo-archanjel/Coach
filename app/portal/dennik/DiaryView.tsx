"use client";

import Link from "next/link";
import { startTransition, useActionState, useOptimistic, useState } from "react";
import { MEAL_SLOT_LABELS, MEAL_SLOT_ORDER, scaleFoodMacros, sumMacros, type MealSlot } from "@/lib/meals";
import type { PortalDiaryData, PortalDiaryEntry, PortalDiaryGroup, PortalFoodOption } from "@/lib/portal/types";
import { addFoodLogAction, removeFoodLogAction, updateFoodLogAction, type ActionState } from "../actions";
import { diaryMinDate, shiftDiaryDate } from "@/lib/portal/diaryDate";
import portalStyles from "../portal.module.css";
import { FoodPickerSheet } from "../../components/food/FoodPickerSheet";
import { MealSlotSection } from "../../components/food/MealSlotSection";
import foodModule from "../../components/food/food.module.css";
import { DiaryRow } from "./DiaryRow";
import { useSkinStyles } from "../../components/uiSkin";

const initialState: ActionState = { error: null };

/** Podiel naplnenia (0–1) — min. viditeľný pruh, keď je nejaká hodnota. */
function fillScale(value: number, goal: number): number {
  const raw = goal > 0 ? Math.min(1, value / goal) : 0;
  return raw > 0 ? Math.max(raw, 0.02) : 0;
}

function MacroBar({ label, value, goal }: { label: string; value: number; goal: number | null }) {
  const styles = useSkinStyles("portal", portalStyles);
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

type DiaryAction =
  | { type: "add"; entry: PortalDiaryEntry }
  | { type: "remove"; id: string }
  | { type: "grams"; id: string; grams: number };

const round1 = (n: number) => Math.round(n * 10) / 10;

function diaryReducer(entries: PortalDiaryEntry[], action: DiaryAction): PortalDiaryEntry[] {
  if (action.type === "add") return [...entries, action.entry];
  if (action.type === "remove") return entries.filter((e) => e.id !== action.id);
  // Zmena gramáže — makrá sú lineárne v gramoch, prepočítaj pomerom (server ich
  // po revalidatePath aj tak dodá presne zo snapshotu na 100 g).
  return entries.map((e) => {
    if (e.id !== action.id || e.grams <= 0) return e;
    const k = action.grams / e.grams;
    return {
      ...e,
      grams: action.grams,
      kcal: Math.round(e.kcal * k),
      proteinG: round1(e.proteinG * k),
      carbsG: round1(e.carbsG * k),
      fatG: round1(e.fatG * k),
    };
  });
}

/** "Dnes" / "Včera" / "Pondelok 21. 9." — nadpis denníka a navigácia medzi dňami. */
function dayLabel(date: string, today: string): string {
  if (date === today) return "Dnes";
  if (date === shiftDiaryDate(today, -1)) return "Včera";
  const label = new Date(`${date}T12:00:00Z`).toLocaleDateString("sk-SK", {
    weekday: "long",
    day: "numeric",
    month: "numeric",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function diaryHref(date: string, today: string): string {
  return date === today ? "/portal/dennik" : `/portal/dennik?date=${date}`;
}

function buildFormData(option: PortalFoodOption, slot: MealSlot, grams: number): FormData {
  const fd = new FormData();
  fd.set("meal_slot", slot);
  fd.set("food_id", option.foodId ?? "");
  fd.set("food_name", option.name);
  fd.set("grams", String(grams));
  fd.set("kcal_100g", String(option.kcal100g));
  fd.set("protein_100g", String(option.protein100g));
  fd.set("carbs_100g", String(option.carbs100g));
  fd.set("fat_100g", String(option.fat100g));
  return fd;
}

/** Rovnaký prepočet ako server (addFoodLogAction) — dočasný riadok pre optimistic UI,
    kým sa nepotvrdí skutočným ID z DB. */
function buildOptimisticEntry(option: PortalFoodOption, slot: MealSlot, grams: number): PortalDiaryEntry {
  const macros = scaleFoodMacros(
    { kcal_100g: option.kcal100g, protein_100g: option.protein100g, carbs_100g: option.carbs100g, fat_100g: option.fat100g },
    grams,
  );
  return {
    id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    slot,
    name: option.name,
    grams,
    kcal: macros.kcal,
    proteinG: macros.proteinG,
    carbsG: macros.carbsG,
    fatG: macros.fatG,
  };
}

/** Skupiny podľa jedla dňa — všetkých 6 aj prázdne (každé má riadok s „+“). Počíta sa
    znova z (optimistickej) plochej listiny záznamov, nech pridanie/odobratie hneď
    prepočíta aj skupiny aj súčty, nielen samotný riadok. */
function buildGroups(entries: PortalDiaryEntry[]): PortalDiaryGroup[] {
  return MEAL_SLOT_ORDER.map((slot) => {
    const items = entries.filter((e) => e.slot === slot);
    return { slot, slotLabel: MEAL_SLOT_LABELS[slot], entries: items, kcal: sumMacros(items).kcal };
  });
}

/**
 * Denník jedla — klientská komponenta (feature/optimalizacia). Predtým bol
 * tento view server component a "pridať"/"odobrať" žili ako dve nezávislé
 * ostrovné komponenty (pridanie jedla, DiaryRow), každá s vlastným
 * useActionState — zoznam/súčty sa aktualizovali až po revalidatePath
 * (celý round-trip). Teraz drží zdieľaný `useOptimistic` nad plochým
 * zoznamom záznamov, obe akcie idú cez tento view, takže pridanie/odobratie
 * jedla sa v zozname aj v makro pruhoch prejaví okamžite.
 */
export function DiaryView({ data }: { data: PortalDiaryData }) {
  const styles = useSkinStyles("portal", portalStyles);
  const food = useSkinStyles("food", foodModule);
  const { goal, date, today } = data;
  const isToday = date === today;
  const prevDate = shiftDiaryDate(date, -1);
  const canGoBack = prevDate >= diaryMinDate(today);

  const [addState, addFormAction, addPending] = useActionState(addFoodLogAction, initialState);
  const [removeState, removeFormAction] = useActionState(removeFoodLogAction, initialState);
  const [updateState, updateFormAction] = useActionState(updateFoodLogAction, initialState);

  const initialEntries = data.groups.flatMap((g) => g.entries);
  const [entries, dispatchOptimistic] = useOptimistic<PortalDiaryEntry[], DiaryAction>(initialEntries, diaryReducer);

  // Riadky jedál sú defaultne zbalené; „+“ otvorí panel pridania pre dané jedlo.
  const [expanded, setExpanded] = useState<ReadonlySet<MealSlot>>(() => new Set());
  const [addSlot, setAddSlot] = useState<MealSlot | null>(null);
  const toggleSlot = (slot: MealSlot) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      return next;
    });

  function handleAdd(fd: FormData, entry: PortalDiaryEntry) {
    fd.set("eaten_on", date); // zápis za práve zobrazený deň (aj spätne)
    // pridané jedlo hneď vidno — jeho riadok sa rozbalí
    setExpanded((prev) => (prev.has(entry.slot) ? prev : new Set(prev).add(entry.slot)));
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

  function handleUpdateGrams(id: string, grams: number) {
    const fd = new FormData();
    fd.set("entry_id", id);
    fd.set("grams", String(grams));
    startTransition(() => {
      dispatchOptimistic({ type: "grams", id, grams });
      updateFormAction(fd);
    });
  }

  const groups = buildGroups(entries);
  // Súčty vždy prepočítané z (optimistickej) plochej listiny — pri chybe
  // uloženia/odobratia React sám zahodí optimistic vrstvu, `entries` sa vráti
  // na pôvodné dáta zo servera a súčet vyjde rovnako ako predtým počítaný `serverTotals`.
  const totals = sumMacros(entries);
  const kcalGoal = goal?.caloriesTarget ?? null;
  const kcalOver = kcalGoal != null && totals.kcal > kcalGoal;

  return (
    <section className={styles.diary} aria-label="Denník jedla">
      <div className={`${styles.panel} ${styles.diaryHero}`}>
        <nav className={styles.diaryDateNav} aria-label="Deň denníka">
          {canGoBack ? (
            <Link href={diaryHref(prevDate, today)} className={styles.diaryDateArrow} aria-label="Predošlý deň">
              ‹
            </Link>
          ) : (
            <span className={`${styles.diaryDateArrow} ${styles.diaryDateArrowOff}`} aria-hidden="true">
              ‹
            </span>
          )}
          <h1 className={styles.diaryHeading}>{isToday ? "Dnešný príjem" : `Príjem — ${dayLabel(date, today)}`}</h1>
          {isToday ? (
            <span className={`${styles.diaryDateArrow} ${styles.diaryDateArrowOff}`} aria-hidden="true">
              ›
            </span>
          ) : (
            <Link href={diaryHref(shiftDiaryDate(date, 1), today)} className={styles.diaryDateArrow} aria-label="Nasledujúci deň">
              ›
            </Link>
          )}
        </nav>
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
      {updateState.error && (
        <p className={styles.addError} role="alert">
          Nepodarilo sa upraviť — {updateState.error}
        </p>
      )}

      <div className={`${food.slots} ${food.slotsCard}`}>
        {groups.map((group) => (
          <MealSlotSection
            key={group.slot}
            slot={group.slot}
            label={group.slotLabel}
            kcal={group.kcal}
            count={group.entries.length}
            open={expanded.has(group.slot)}
            onToggle={() => toggleSlot(group.slot)}
            onAdd={() => setAddSlot(group.slot)}
          >
            <ul className={styles.diaryList}>
              {group.entries.map((entry) => (
                <DiaryRow key={entry.id} entry={entry} onRemove={handleRemove} onUpdateGrams={handleUpdateGrams} />
              ))}
            </ul>
          </MealSlotSection>
        ))}
      </div>

      {addSlot && (
        <FoodPickerSheet
          title={`Pridať jedlo · ${MEAL_SLOT_LABELS[addSlot]}`}
          note={isToday ? null : `Zapisuješ za ${dayLabel(date, today).toLowerCase()}.`}
          pending={addPending}
          error={addState.error}
          onSubmit={(option, grams) => handleAdd(buildFormData(option, addSlot, grams), buildOptimisticEntry(option, addSlot, grams))}
          onClose={() => setAddSlot(null)}
        />
      )}
    </section>
  );
}
