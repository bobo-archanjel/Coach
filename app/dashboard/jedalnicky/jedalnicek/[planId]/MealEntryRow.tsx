"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { MealEntry } from "../actions";
import { MEAL_SLOT_ORDER, scaleFoodMacros, type MealSlot } from "@/lib/meals";
import type { PortionUnit } from "@/lib/portions";
import { usePortionLabel } from "@/app/components/food/usePortionLabel";
import { MacroChips } from "./MacroChips";
import styles from "./builder.module.css";

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

/** Položka dňa — úprava aj odstránenie len lokálne, do DB ide cez „Uložiť zmeny". */
export function MealEntryRow({
  entry,
  onUpdate,
  onRemove,
}: {
  entry: MealEntry;
  onUpdate: (patch: { meal_slot: MealSlot; grams: number; portion_unit: PortionUnit; portion_qty: number }) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("mealPlans.builder");
  const tl = useTranslations("labels");
  const tf = useTranslations("food");
  const portionLabel = usePortionLabel();
  // Položka v ks/porcii/balení sa upravuje v tej istej jednotke (hmotnosť jednotky = grams / qty;
  // pri uložení ju server prepočíta znova z potraviny). ml sa upravuje ako gramy a ostáva ml.
  const perUnit =
    (entry.portion_unit === "piece" || entry.portion_unit === "serving" || entry.portion_unit === "package") &&
    entry.portion_qty &&
    entry.portion_qty > 0
      ? entry.grams / entry.portion_qty
      : null;
  const editUnit: PortionUnit | null = perUnit ? (entry.portion_unit as PortionUnit) : entry.portion_unit === "ml" ? "ml" : null;
  const initialValue = perUnit ? (entry.portion_qty as number) : entry.grams;
  const [editing, setEditing] = useState(false);
  const [slot, setSlot] = useState<MealSlot>(entry.meal_slot);
  const [grams, setGrams] = useState(String(initialValue));
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setSlot(entry.meal_slot);
    setGrams(String(initialValue));
    setError(null);
    setEditing(true);
  };

  const apply = () => {
    const v = Number(grams.replace(",", "."));
    const g = perUnit ? v * perUnit : v;
    if (!Number.isFinite(v) || v <= 0 || !Number.isFinite(g) || g <= 0 || g > 5000) {
      setError(t(perUnit ? "qtyRange" : "gramsRange"));
      return;
    }
    const rounded = Math.round(g * 10) / 10;
    // vždy pošli jednotku: inak by `{...m, ...patch}` nechal starú (napr. g s pôvodným množstvom)
    // a server by prepísal novú gramáž
    onUpdate({
      meal_slot: slot,
      grams: rounded,
      ...(perUnit
        ? { portion_unit: editUnit as PortionUnit, portion_qty: Math.round(v * 100) / 100 }
        : { portion_unit: editUnit === "ml" ? ("ml" as const) : ("g" as const), portion_qty: rounded }),
    });
    setEditing(false);
  };

  const macros = scaleFoodMacros(entry, entry.grams);

  if (editing) {
    return (
      <form
        className={styles.editForm}
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <span className={styles.editName}>{entry.food_name}</span>
        <div className={styles.editGrid}>
          <label className={`${styles.editField} ${styles.editFieldSlot}`}>
            <span className={styles.editFieldLabel}>{t("slot")}</span>
            <select value={slot} onChange={(e) => setSlot(e.target.value as MealSlot)}>
              {MEAL_SLOT_ORDER.map((s) => (
                <option key={s} value={s}>
                  {tl(`mealSlot.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label className={`${styles.editField} ${styles.editFieldGrams}`}>
            <span className={styles.editFieldLabel}>{editUnit ? t("quantity", { unit: tf(`unit.${editUnit}`) }) : t("grams")}</span>
            <input
              type="text"
              inputMode="decimal"
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
              autoFocus
            />
          </label>
        </div>
        <div className={styles.editActions}>
          <button type="submit" className="btn btn-primary btn-sm">
            {t("done")}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
            {t("cancel")}
          </button>
        </div>
        {error && <p className={styles.formError}>{error}</p>}
      </form>
    );
  }

  return (
    <div className={styles.exerciseRow}>
      <span className={styles.exerciseName}>{entry.food_name}</span>
      <span className={styles.exerciseSummary}>
        {portionLabel({ grams: entry.grams, unit: entry.portion_unit, qty: entry.portion_qty, base: entry.portion_base })} · {macros.kcal} kcal
      </span>
      <MacroChips proteinG={macros.proteinG} carbsG={macros.carbsG} fatG={macros.fatG} />
      <div className={styles.rowActions}>
        <button type="button" className={styles.iconBtn} onClick={startEdit} aria-label={t("editItem")}>
          <EditIcon />
        </button>
        <button type="button" className={`${styles.iconBtn} btn-danger`} onClick={onRemove} aria-label={t("removeItem")}>
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}
