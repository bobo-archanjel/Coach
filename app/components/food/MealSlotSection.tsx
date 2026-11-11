"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { MealSlot } from "@/lib/meals";
import styles from "./food.module.css";

const iconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

/** Ikona jedla dňa. */
function MealIcon({ slot, className }: { slot: MealSlot; className?: string }) {
  switch (slot) {
    case "ranajky": // východ slnka
      return (
        <svg {...iconProps} className={className}>
          <path d="M5 13a5 5 0 0110 0M2.5 16h15M10 4v2M4.3 7.3l1.4 1.4M15.7 7.3l-1.4 1.4" />
        </svg>
      );
    case "desiata": // jablko
      return (
        <svg {...iconProps} className={className}>
          <path d="M10 6.5c-1.6-1.2-5.5-1-5.5 3.5 0 3.6 2.4 7 4 7 .6 0 .9-.4 1.5-.4s.9.4 1.5.4c1.6 0 4-3.4 4-7 0-4.5-3.9-4.7-5.5-3.5z" />
          <path d="M10 6.5c0-1.5.7-3 2.5-3.5" />
        </svg>
      );
    case "obed": // tanier
      return (
        <svg {...iconProps} className={className}>
          <circle cx="10" cy="10" r="7" />
          <circle cx="10" cy="10" r="3.8" />
        </svg>
      );
    case "olovrant": // šálka
      return (
        <svg {...iconProps} className={className}>
          <path d="M4 8h9v4a4 4 0 01-4 4H8a4 4 0 01-4-4V8zM13 9.5h1.5a2 2 0 010 4H13M7 3.5v2M10 3.5v2" />
        </svg>
      );
    case "vecera": // mesiac
      return (
        <svg {...iconProps} className={className}>
          <path d="M15.5 12.5A6.5 6.5 0 017.5 4.5a6.5 6.5 0 108 8z" />
        </svg>
      );
    default: // iné
      return (
        <svg {...iconProps} className={className}>
          <circle cx="5" cy="10" r="1" />
          <circle cx="10" cy="10" r="1" />
          <circle cx="15" cy="10" r="1" />
        </svg>
      );
  }
}

const ChevronIcon = ({ className }: { className?: string }) => (
  <svg {...iconProps} width={16} height={16} className={className}>
    <path d="M7 5l5 5-5 5" />
  </svg>
);

const PlusIcon = () => (
  <svg {...iconProps} width={18} height={18} strokeWidth={2}>
    <path d="M10 4v12M4 10h12" />
  </svg>
);

/**
 * Riadok jedla dňa (Raňajky … Iné) — denník klienta aj builder jedálnička trénera.
 * Hlavička: ikona, názov, kcal, šípka (rozbalí/zbalí položky) a „+“ (otvorí panel
 * „Pridať jedlo“ pre toto jedlo). Položky (`children`) dodá rodič — každý má vlastné
 * riadky (DiaryRow, MealEntryRow). Kontajner riadkov: `.slots` (+ `.slotsCard` ako karta).
 */
export function MealSlotSection({
  slot,
  label,
  kcal,
  count,
  open,
  onToggle,
  onAdd,
  children,
}: {
  slot: MealSlot;
  label: string;
  kcal: number;
  /** počet položiek — 0 = namiesto `children` krátka výzva na pridanie */
  count: number;
  open: boolean;
  onToggle: () => void;
  onAdd: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("components.mealSlot");
  return (
    <div className={styles.slot}>
      <div className={styles.slotHead}>
        <button
          type="button"
          className={styles.slotToggle}
          aria-expanded={open}
          aria-controls={`meal-${slot}`}
          onClick={onToggle}
        >
          <MealIcon slot={slot} className={styles.slotIcon} />
          <span className={styles.slotName}>{label}</span>
          <span className={`${styles.slotKcal} ${count === 0 ? styles.slotKcalEmpty : ""}`}>{kcal} kcal</span>
          <ChevronIcon className={`${styles.slotChevron} ${open ? styles.slotChevronOpen : ""}`} />
        </button>
        <button type="button" className={styles.slotAdd} onClick={onAdd} aria-label={t("add", { label })}>
          <PlusIcon />
        </button>
      </div>
      {open && (
        <div id={`meal-${slot}`} className={styles.slotBody}>
          {count > 0 ? children : <p className={styles.slotEmpty}>{t("empty")}</p>}
        </div>
      )}
    </div>
  );
}
