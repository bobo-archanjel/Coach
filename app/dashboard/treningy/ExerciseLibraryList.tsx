"use client";

import { useLocale, useTranslations } from "next-intl";
import { muscleGroupLabel } from "@/lib/i18n/muscles";
import { useState, useTransition } from "react";
import { getExerciseLibraryListAction, type ExerciseListItem } from "./actions";
import styles from "../dashboard.module.css";

/**
 * Zoznam celej knižnice cvikov — predtým sa ťahal (a vypísal, ~900 <span> tagov)
 * pri KAŽDOM načítaní /dashboard/treningy, aj keď tréner len chce vytvoriť plán
 * alebo pridať vlastný cvik vyššie. Teraz zbalené, načíta sa až na kliknutie.
 */
export function ExerciseLibraryList({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ExerciseListItem[] | null>(null);
  const [pending, startTransition] = useTransition();
  const t = useTranslations("plans.libraryList");
  const locale = useLocale();

  const reveal = () => {
    setOpen(true);
    if (!items) {
      startTransition(async () => {
        setItems(await getExerciseLibraryListAction());
      });
    }
  };

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 14 }} onClick={reveal}>
        {t("show", { count })}
      </button>
    );
  }

  return (
    <div className={styles.tagList} style={{ marginTop: 14 }}>
      {pending && !items ? (
        <span>{t("loading")}</span>
      ) : (
        (items ?? []).map((ex) => (
          <span key={ex.id}>
            {ex.name}
            {ex.muscleGroup ? ` · ${muscleGroupLabel(ex.muscleGroup, locale)}` : ""}
          </span>
        ))
      )}
    </div>
  );
}
