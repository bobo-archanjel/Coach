"use client";

import { useActionState } from "react";
import { addFoodToDayAction, type ActionState } from "../actions";
import styles from "./builder.module.css";

const initialState: ActionState = { error: null };

export function FoodLibraryItem({
  food,
  dayId,
  planId,
}: {
  food: { id: string; name: string; kcal_100g: number; protein_100g: number; carbs_100g: number; fat_100g: number };
  dayId: string | null;
  planId: string;
}) {
  const [, formAction, pending] = useActionState(addFoodToDayAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="food_id" value={food.id} readOnly />
      <input type="hidden" name="plan_id" value={planId} readOnly />
      <input type="hidden" name="day_id" value={dayId ?? ""} readOnly />
      <button
        type="submit"
        className={styles.libraryItem}
        disabled={pending || !dayId}
        title={!dayId ? "Najprv vytvor deň" : `Pridať ${food.name} (100 g) do dňa`}
      >
        <span>{food.name}</span>
        <span className={styles.libraryItemMuscle}>{food.kcal_100g} kcal/100g</span>
      </button>
    </form>
  );
}
