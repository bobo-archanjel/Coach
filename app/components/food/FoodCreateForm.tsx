"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { kcalMismatch } from "@/lib/meals";
import type { BarcodePrefill, PortalFoodOption } from "@/lib/portal/types";
import { createUserFoodAction } from "./actions";
import styles from "./food.module.css";

const asField = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
const asNumber = (s: string) => Number(s.trim().replace(",", "."));

/**
 * Nová vlastná potravina (source='user'): názov, značka, hodnoty na 100 g z obalu.
 * - po skene, ktorý produkt nenašiel (alebo Open Food Facts nemá kompletné hodnoty) —
 *   `prefill` s kódom a tým, čo vieme; nabudúce ju sken toho kódu nájde,
 * - tréner ručne v builderi jedálnička (`prefill` null) — kód je nepovinný.
 * Ak kcal nesedia s 4·B + 4·S + 9·T, ukáže upozornenie — uložiť sa dá aj tak.
 */
export function FoodCreateForm({
  prefill,
  onCreated,
  onCancel,
}: {
  prefill: BarcodePrefill | null;
  onCreated: (food: PortalFoodOption) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("food.create");
  const tf = useTranslations("food");
  const fromScan = Boolean(prefill?.barcode);
  const [form, setForm] = useState({
    barcode: prefill?.barcode ?? "",
    name: prefill?.name ?? "",
    brand: prefill?.brand ?? "",
    kcal: asField(prefill?.kcal100g),
    protein: asField(prefill?.protein100g),
    carbs: asField(prefill?.carbs100g),
    fat: asField(prefill?.fat100g),
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filled = [form.kcal, form.protein, form.carbs, form.fat].every((v) => v.trim() !== "");
  const mismatch = filled
    ? kcalMismatch(asNumber(form.kcal), asNumber(form.protein), asNumber(form.carbs), asNumber(form.fat))
    : null;

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await createUserFoodAction(form);
      if (res.error || !res.food) {
        setError(res.error ?? t("saveFailed"));
        return;
      }
      onCreated(res.food);
    });
  }

  return (
    <div className={styles.form}>
      {fromScan ? (
        <>
          <p className={styles.scanResultTitle}>{t("unknownTitle")}</p>
          <p className={styles.meta}>{t("unknownText")}</p>
          <p className={styles.scanCode}>{tf("code", { code: form.barcode })}</p>
        </>
      ) : (
        <p className={styles.meta}>{t("intro")}</p>
      )}
      <input
        className={styles.search}
        type="text"
        placeholder={t("namePlaceholder")}
        maxLength={100}
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        aria-label={t("name")}
      />
      <input
        className={styles.search}
        type="text"
        placeholder={t("brandPlaceholder")}
        maxLength={60}
        value={form.brand}
        onChange={(e) => setForm({ ...form, brand: e.target.value })}
        aria-label={t("brand")}
      />
      {!fromScan && (
        <input
          className={styles.search}
          type="text"
          inputMode="numeric"
          placeholder={t("barcodePlaceholder")}
          maxLength={18}
          value={form.barcode}
          onChange={(e) => setForm({ ...form, barcode: e.target.value })}
          aria-label={t("barcode")}
        />
      )}
      <p className={styles.meta}>{t("per100Hint")}</p>
      <div className={styles.formGrid}>
        {(
          [
            ["kcal", t("kcal")],
            ["protein", t("protein")],
            ["carbs", t("carbs")],
            ["fat", t("fat")],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className={styles.formField}>
            <span>{label}</span>
            <input
              className={styles.gramInput}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.1"
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      {mismatch && (
        <p className={styles.warn} role="status">
          {t("mismatch", { kcal: mismatch.estimatedKcal })}
        </p>
      )}
      <div className={styles.scanActions}>
        <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={save}>
          {pending ? t("saving") : t("save")}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={onCancel}>
            {t("cancel")}
          </button>
        )}
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
