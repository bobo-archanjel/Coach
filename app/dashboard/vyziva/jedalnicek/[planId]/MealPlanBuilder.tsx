"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { FoodLibrary } from "./FoodLibrary";
import { MealEntryRow } from "./MealEntryRow";
import { AddMealDayInline } from "./AddMealDayInline";
import { MealDayActions } from "./MealDayActions";
import { MacroChips } from "./MacroChips";
import { MealPublishActions } from "./MealPlanControls";
import type { LibraryFood } from "./FoodLibraryItem";
import { saveMealPlanDaysAction, type MealEntry } from "../actions";
import { MEAL_SLOT_LABELS, MEAL_SLOT_ORDER, scaleFoodMacros, sumMacros, type MealSlot } from "@/lib/meals";
import styles from "./builder.module.css";
import dashStyles from "../../../dashboard.module.css";

interface Day {
  /** "new-…" = deň pridaný lokálne, v DB ešte nie je */
  id: string;
  day_number: number;
  name: string;
  meals: MealEntry[];
}

const NEW_PREFIX = "new-";
const UNSAVED_MSG = "Máš neuložené zmeny v jedálničku. Odísť bez uloženia?";

// crypto.randomUUID existuje len v secure contexte — na iPhone cez LAN (http://192.168…)
// by spadol. Server aj tak overí formát a prípadne pridelí vlastné ID.
function localId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Builder jedálnička. Úpravy (dni, potraviny, gramáže) sa držia LOKÁLNE a do DB idú
 * až cez „Uložiť zmeny" — predtým sa každý klik hneď zapísal, takže zverejnený
 * jedálniček sa klientovi menil priebežne a nechcená zmena sa nedala vziať späť.
 * „Zahodiť" vráti posledný uložený stav.
 */
export function MealPlanBuilder({
  planId,
  published,
  days,
  library,
}: {
  planId: string;
  published: boolean;
  days: Day[];
  library: LibraryFood[];
}) {
  const [saved, setSaved] = useState(days);
  const [draft, setDraft] = useState(days);
  const [activeDayId, setActiveDayId] = useState<string | null>(days[0]?.id ?? null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [savePending, startSave] = useTransition();

  // Nová serverová pravda (po uložení) → prepíše lokálny stav. Revalidácia z iného
  // dôvodu (premenovanie jedálnička, zverejnenie) dni nemení → rozpracované úpravy ostanú.
  const daysKey = JSON.stringify(days);
  useEffect(() => {
    // Práve uložený nový deň dostal skutočné ID — ostaň na ňom (poradie = day_number).
    setActiveDayId((prev) => {
      if (!prev?.startsWith(NEW_PREFIX)) return prev;
      return days[draft.findIndex((d) => d.id === prev)]?.id ?? prev;
    });
    setSaved(days);
    setDraft(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysKey]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);

  // Ak aktívny deň zmizol alebo ešte nebol vybraný, spadni na prvý dostupný.
  useEffect(() => {
    if (draft.length === 0) {
      if (activeDayId !== null) setActiveDayId(null);
      return;
    }
    if (!draft.some((d) => d.id === activeDayId)) {
      setActiveDayId(draft[0].id);
    }
  }, [draft, activeDayId]);

  // Odchod zo stránky s neuloženými zmenami: reload/zatvorenie (beforeunload) aj klik
  // na odkaz v appke (App Router navigáciu inak zablokovať nejde).
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!a || a.getAttribute("target") === "_blank") return;
      const href = a.getAttribute("href") ?? "";
      if (href.startsWith("#") || href.startsWith("/api/")) return;
      if (!window.confirm(UNSAVED_MSG)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 4000);
    return () => clearTimeout(t);
  }, [justSaved]);

  const edit = (fn: (days: Day[]) => Day[]) => {
    setJustSaved(false);
    setSaveError(null);
    setDraft(fn);
  };
  const editDay = (dayId: string, fn: (day: Day) => Day) =>
    edit((ds) => ds.map((d) => (d.id === dayId ? fn(d) : d)));

  const addDay = (name: string) => {
    const id = `${NEW_PREFIX}${localId()}`;
    edit((ds) => [...ds, { id, day_number: ds.length + 1, name, meals: [] }]);
    setActiveDayId(id);
  };

  const addFood = (food: LibraryFood) => {
    if (!activeDayId) return;
    const entry: MealEntry = {
      entry_id: localId(),
      food_id: food.id,
      food_name: food.name,
      meal_slot: "ranajky",
      grams: 100,
      kcal_100g: food.kcal_100g,
      protein_100g: food.protein_100g,
      carbs_100g: food.carbs_100g,
      fat_100g: food.fat_100g,
    };
    editDay(activeDayId, (d) => ({ ...d, meals: [...d.meals, entry] }));
  };

  /** Uloží rozpracovaný stav; true = podarilo sa (volá ho aj „Uložiť a zverejniť"). */
  const save = () =>
    new Promise<boolean>((resolve) => {
      setSaveError(null);
      startSave(async () => {
        const res = await saveMealPlanDaysAction(
          planId,
          draft.map((d) => ({
            id: d.id.startsWith(NEW_PREFIX) ? null : d.id,
            name: d.name,
            meals: d.meals.map(({ entry_id, food_id, meal_slot, grams }) => ({ entry_id, food_id, meal_slot, grams })),
          })),
        );
        if (res.error) {
          setSaveError(res.error);
          resolve(false);
          return;
        }
        setJustSaved(true);
        resolve(true);
      });
    });

  const discard = () => {
    setDraft(saved);
    setSaveError(null);
  };

  const activeDay = draft.find((d) => d.id === activeDayId) ?? null;

  const dayTotal = useMemo(() => {
    if (!activeDay) return null;
    return sumMacros(activeDay.meals.map((entry) => scaleFoodMacros(entry, entry.grams)));
  }, [activeDay]);

  return (
    <>
      {/* Vždy v DOM (aj po zverejnení) — inak by revalidácia odmontovala potvrdenie
          „Zverejnené"; prázdny blok skryje .planActions:empty. */}
      <div className={dashStyles.planActions}>
        <MealPublishActions planId={planId} published={published} dirty={dirty} saveFirst={save} />
      </div>

      <div className={styles.builderGrid}>
        <FoodLibrary foods={library} activeDayId={activeDay?.id ?? null} onAddFood={addFood} />

        <div className={styles.canvas}>
          <div className={styles.dayTabs}>
            {draft.map((day) => (
              <button
                key={day.id}
                type="button"
                className={`${styles.dayTab} ${day.id === activeDayId ? styles.dayTabActive : ""}`}
                onClick={() => setActiveDayId(day.id)}
                aria-current={day.id === activeDayId ? "true" : undefined}
              >
                {day.name}
              </button>
            ))}
            <AddMealDayInline nextDayNumber={draft.length + 1} onAdd={addDay} />
            {activeDay && (
              // key: po premenovaní/prepnutí dňa sa zavrie rozpracovaný formulár
              <MealDayActions
                key={`${activeDay.id}-${activeDay.name}`}
                name={activeDay.name}
                foodCount={activeDay.meals.length}
                onRename={(name) => editDay(activeDay.id, (d) => ({ ...d, name }))}
                onDelete={() => edit((ds) => ds.filter((d) => d.id !== activeDay.id))}
              />
            )}
          </div>

          <div className={styles.dayPanel}>
            {activeDay ? (
              activeDay.meals.length > 0 ? (
                <>
                  {dayTotal && (
                    <div className={styles.dayTotals}>
                      <span>{dayTotal.kcal} kcal / deň</span>
                      <MacroChips proteinG={dayTotal.proteinG} carbsG={dayTotal.carbsG} fatG={dayTotal.fatG} size="lg" />
                    </div>
                  )}
                  {MEAL_SLOT_ORDER.map((slot) => {
                    const entries = activeDay.meals.filter((m) => m.meal_slot === slot);
                    if (entries.length === 0) return null;
                    return (
                      <div key={slot} className={styles.mealGroup}>
                        <div className={styles.mealGroupHead}>{MEAL_SLOT_LABELS[slot]}</div>
                        {entries.map((entry) => (
                          <MealEntryRow
                            key={entry.entry_id}
                            entry={entry}
                            onUpdate={(patch: { meal_slot: MealSlot; grams: number }) =>
                              editDay(activeDay.id, (d) => ({
                                ...d,
                                meals: d.meals.map((m) => (m.entry_id === entry.entry_id ? { ...m, ...patch } : m)),
                              }))
                            }
                            onRemove={() =>
                              editDay(activeDay.id, (d) => ({
                                ...d,
                                meals: d.meals.filter((m) => m.entry_id !== entry.entry_id),
                              }))
                            }
                          />
                        ))}
                      </div>
                    );
                  })}
                </>
              ) : (
                <p className={styles.emptyDay}>
                  Zatiaľ žiadne potraviny — klikni na potravinu v knižnici, pridá sa sem (100 g,
                  raňajky) a hneď si to upravíš.
                </p>
              )
            ) : (
              <p className={styles.emptyDay}>Vytvor prvý deň vyššie.</p>
            )}
          </div>
        </div>
      </div>

      {(dirty || saveError || justSaved) && (
        <div className={styles.saveBar} role="region" aria-label="Uloženie zmien">
          <span className={`${styles.saveBarText} ${saveError ? styles.saveBarError : ""}`} role="status">
            {saveError
              ? saveError
              : dirty
                ? published
                  ? "Neuložené zmeny — klient ich uvidí až po uložení."
                  : "Neuložené zmeny"
                : "Zmeny uložené."}
          </span>
          {dirty && (
            <div className={styles.saveBarActions}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={discard} disabled={savePending}>
                Zahodiť
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void save()} disabled={savePending}>
                {savePending ? "Ukladám…" : "Uložiť zmeny"}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
