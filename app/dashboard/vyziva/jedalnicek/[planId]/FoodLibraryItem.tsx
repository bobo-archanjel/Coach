"use client";
import mealBuilderModule from "./builder.module.css";
import { useSkinStyles } from "@/app/components/uiSkin";


export interface LibraryFood {
  id: string;
  name: string;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
}

/** Klik pridá potravinu do aktívneho dňa (100 g, raňajky) — zatiaľ len lokálne, uloží sa cez „Uložiť zmeny". */
export function FoodLibraryItem({
  food,
  dayId,
  onAdd,
}: {
  food: LibraryFood;
  dayId: string | null;
  onAdd: (food: LibraryFood) => void;
}) {
  const styles = useSkinStyles("mealBuilder", mealBuilderModule);
  return (
    <button
      type="button"
      className={styles.libraryItem}
      disabled={!dayId}
      onClick={() => onAdd(food)}
      title={!dayId ? "Najprv vytvor deň" : `Pridať ${food.name} (100 g) do dňa`}
    >
      <span>{food.name}</span>
      <span className={styles.libraryItemMuscle}>{food.kcal_100g} kcal/100g</span>
    </button>
  );
}
