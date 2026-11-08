"use client";

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
        setError(res.error ?? "Potravinu sa nepodarilo uložiť.");
        return;
      }
      onCreated(res.food);
    });
  }

  return (
    <div className={styles.form}>
      {fromScan ? (
        <>
          <p className={styles.scanResultTitle}>Tento produkt zatiaľ nepoznáme</p>
          <p className={styles.meta}>Založ ho podľa obalu — nabudúce ho sken nájde hneď.</p>
          <p className={styles.scanCode}>Kód {form.barcode}</p>
        </>
      ) : (
        <p className={styles.meta}>Potravina, ktorá nie je v knižnici ani medzi značkami. Uvidíš ju len ty.</p>
      )}
      <input
        className={styles.search}
        type="text"
        placeholder="Názov, napr. „Skyr vanilka“"
        maxLength={100}
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        aria-label="Názov potraviny"
      />
      <input
        className={styles.search}
        type="text"
        placeholder="Značka (nepovinné)"
        maxLength={60}
        value={form.brand}
        onChange={(e) => setForm({ ...form, brand: e.target.value })}
        aria-label="Značka"
      />
      {!fromScan && (
        <input
          className={styles.search}
          type="text"
          inputMode="numeric"
          placeholder="Čiarový kód (nepovinné)"
          maxLength={18}
          value={form.barcode}
          onChange={(e) => setForm({ ...form, barcode: e.target.value })}
          aria-label="Čiarový kód"
        />
      )}
      <p className={styles.meta}>Hodnoty na 100 g (nájdeš ich v tabuľke na obale):</p>
      <div className={styles.formGrid}>
        {(
          [
            ["kcal", "kcal"],
            ["protein", "Bielkoviny g"],
            ["carbs", "Sacharidy g"],
            ["fat", "Tuky g"],
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
          Kalórie nesedia s makrami — z bielkovín, sacharidov a tukov vychádza asi {mismatch.estimatedKcal} kcal.
          Skontroluj hodnoty na obale (uložiť sa dá aj tak).
        </p>
      )}
      <div className={styles.scanActions}>
        <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={save}>
          {pending ? "Ukladám…" : "Uložiť potravinu"}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={onCancel}>
            Zrušiť
          </button>
        )}
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
