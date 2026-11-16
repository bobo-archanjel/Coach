"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { PortalDiaryEntry } from "@/lib/portal/types";
import type { Portion, PortionUnit } from "@/lib/portions";
import { usePortionLabel } from "@/app/components/food/usePortionLabel";
import styles from "../portal.module.css";

const TrashIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M5 7h14M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.4L18 7M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PencilIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Úprava aj odobratie idú cez callbacky z rodiča (DiaryView) — ten spustí
 * optimistickú zmenu zdieľaného zoznamu + skutočnú server action v jednej
 * transition, takže riadok aj súčty sa zmenia hneď. Odobratie má inline
 * potvrdenie (QA 2026-09-23: kôš mazal okamžite, bez možnosti vrátiť).
 */
export function DiaryRow({
  entry,
  onRemove,
  onUpdateGrams,
}: {
  entry: PortalDiaryEntry;
  onRemove: (id: string) => void;
  /** `portion` = nové množstvo v pôvodnej jednotke záznamu (ks/porcia/balenie/ml), inak len gramy */
  onUpdateGrams: (id: string, grams: number, portion: Portion | null) => void;
}) {
  const t = useTranslations("portal.diary");
  const tf = useTranslations("food");
  const portionLabel = usePortionLabel();
  // Záznam v ks/porcii/balení sa upravuje v tej istej jednotke (hmotnosť jednotky = grams / qty);
  // ml sa upravuje ako gramy a ostáva ml. Starý záznam / g: len gramy.
  const perUnit =
    (entry.portionUnit === "piece" || entry.portionUnit === "serving" || entry.portionUnit === "package") &&
    entry.portionQty &&
    entry.portionQty > 0
      ? entry.grams / entry.portionQty
      : null;
  const editUnit: PortionUnit | null = perUnit ? (entry.portionUnit as PortionUnit) : entry.portionUnit === "ml" ? "ml" : null;
  const initialValue = perUnit ? (entry.portionQty as number) : entry.grams;
  const base = entry.portionBase === "ml" ? "ml" : "g";
  const [mode, setMode] = useState<"view" | "edit" | "confirmRemove">("view");
  const [grams, setGrams] = useState(String(initialValue));
  // Optimistický riadok ešte nemá skutočné ID z DB — úprava/odobratie počká.
  const pendingRow = entry.id.startsWith("optimistic-");

  function saveGrams() {
    const v = Number(grams.replace(",", "."));
    const g = perUnit ? Math.round(v * perUnit * 10) / 10 : v;
    if (!Number.isFinite(v) || v <= 0 || !Number.isFinite(g) || g <= 0 || g > 5000) return;
    setMode("view");
    if (v === initialValue) return;
    onUpdateGrams(entry.id, g, perUnit ? { unit: editUnit as PortionUnit, qty: v, base } : editUnit === "ml" ? { unit: "ml", qty: g, base } : null);
  }

  // Úprava: názov na celý riadok, pole gramáže a tlačidlá pod ním — dlhý názov sa inak
  // tlačil do úzkeho stĺpca vedľa poľa a pretekal cez neho.
  if (mode === "edit") {
    return (
      <li className={`${styles.diaryRow} ${styles.diaryRowEdit}`}>
        <span className={styles.diaryName}>{entry.name}</span>
        <span className={styles.diaryRowActions}>
          <span className={styles.gramField}>
            <input
              className={styles.gramInput}
              type="text"
              inputMode="decimal"
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveGrams();
                if (e.key === "Escape") setMode("view");
              }}
              aria-label={t("gramsAria", { name: entry.name })}
              autoFocus
            />
            <span className={styles.gramUnit}>{editUnit ? tf(`unit.${editUnit}`) : "g"}</span>
          </span>
          <button type="button" className="btn btn-primary btn-sm" onClick={saveGrams}>
            {t("save")}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("view")}>
            {t("cancel")}
          </button>
        </span>
      </li>
    );
  }

  return (
    <li className={styles.diaryRow}>
      <span>
        <span className={styles.diaryName}>{entry.name}</span>
        <span className={styles.diaryMeta}>
          {portionLabel({ grams: entry.grams, unit: entry.portionUnit, qty: entry.portionQty, base: entry.portionBase })} · {entry.proteinG}g B · {entry.carbsG}g S · {entry.fatG}g T
        </span>
      </span>
      <span className={styles.diaryKcalCell}>{entry.kcal} kcal</span>
      {mode === "confirmRemove" ? (
        <span className={styles.diaryRowActions}>
          <button type="button" className="btn btn-primary btn-sm btn-danger" onClick={() => onRemove(entry.id)}>
            {t("remove")}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("view")}>
            {t("no")}
          </button>
        </span>
      ) : (
        <span style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            className={styles.removeBtn}
            disabled={pendingRow}
            onClick={() => {
              setGrams(String(initialValue));
              setMode("edit");
            }}
            aria-label={t("editGramsAria", { name: entry.name })}
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            className={`${styles.removeBtn} btn-danger`}
            disabled={pendingRow}
            onClick={() => setMode("confirmRemove")}
            aria-label={t("removeAria", { name: entry.name })}
          >
            <TrashIcon />
          </button>
        </span>
      )}
    </li>
  );
}
