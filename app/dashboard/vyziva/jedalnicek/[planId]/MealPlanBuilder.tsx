"use client";

import { useEffect, useMemo, useState } from "react";
import { FoodLibrary } from "./FoodLibrary";
import { MealEntryRow } from "./MealEntryRow";
import { AddMealDayInline } from "./AddMealDayInline";
import type { MealEntry } from "../actions";
import { MEAL_SLOT_LABELS, MEAL_SLOT_ORDER, scaleFoodMacros, sumMacros } from "@/lib/meals";
import styles from "./builder.module.css";

interface Day {
  id: string;
  day_number: number;
  name: string;
  meals: MealEntry[];
}

export function MealPlanBuilder({
  planId,
  days,
  library,
}: {
  planId: string;
  days: Day[];
  library: { id: string; name: string; kcal_100g: number; protein_100g: number; carbs_100g: number; fat_100g: number }[];
}) {
  const [activeDayId, setActiveDayId] = useState<string | null>(days[0]?.id ?? null);

  // Ak aktívny deň zmizol alebo ešte nebol vybraný, spadni na prvý dostupný.
  useEffect(() => {
    if (days.length === 0) {
      if (activeDayId !== null) setActiveDayId(null);
      return;
    }
    if (!days.some((d) => d.id === activeDayId)) {
      setActiveDayId(days[0].id);
    }
  }, [days, activeDayId]);

  const activeDay = days.find((d) => d.id === activeDayId) ?? null;

  const dayTotal = useMemo(() => {
    if (!activeDay) return null;
    return sumMacros(activeDay.meals.map((entry) => scaleFoodMacros(entry, entry.grams)));
  }, [activeDay]);

  return (
    <div className={styles.builderGrid}>
      <FoodLibrary foods={library} activeDayId={activeDay?.id ?? null} planId={planId} />

      <div className={styles.canvas}>
        <div className={styles.dayTabs}>
          {days.map((day) => (
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
          <AddMealDayInline planId={planId} nextDayNumber={days.length + 1} />
        </div>

        <div className={styles.dayPanel}>
          {activeDay ? (
            activeDay.meals.length > 0 ? (
              <>
                {dayTotal && (
                  <div className={styles.dayTotals}>
                    <span>{dayTotal.kcal} kcal / deň</span>
                    <span>
                      {dayTotal.proteinG}g B · {dayTotal.carbsG}g S · {dayTotal.fatG}g T
                    </span>
                  </div>
                )}
                {MEAL_SLOT_ORDER.map((slot) => {
                  const entries = activeDay.meals.filter((m) => m.meal_slot === slot);
                  if (entries.length === 0) return null;
                  return (
                    <div key={slot} className={styles.mealGroup}>
                      <div className={styles.mealGroupHead}>{MEAL_SLOT_LABELS[slot]}</div>
                      {entries.map((entry) => (
                        <MealEntryRow key={entry.entry_id} entry={entry} dayId={activeDay.id} planId={planId} />
                      ))}
                    </div>
                  );
                })}
              </>
            ) : (
              <p className={styles.emptyDay}>
                Zatiaľ žiadne potraviny — klikni na potravinu v knižnici vľavo, pridá sa sem (100 g,
                raňajky) a hneď si to upravíš.
              </p>
            )
          ) : (
            <p className={styles.emptyDay}>Vytvor prvý deň vyššie.</p>
          )}
        </div>
      </div>
    </div>
  );
}
