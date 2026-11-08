"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import type { PortalExercise } from "@/lib/portal/types";
import { getExerciseDetailAction } from "./actions";
import type { ExerciseDetail } from "@/lib/exercises";
import styles from "./portal.module.css";

// Modal (obrázky + kroky cvičenia) sa otvorí len na klik na konkrétny cvik —
// vlastný chunk namiesto toho, aby bol súčasťou karty Dnes/zoznamu tréningov
// pre všetkých, ktorí sa naň nikdy nepozrú.
const ExerciseDetailModal = dynamic(() =>
  import("@/app/components/ExerciseDetailModal").then((m) => m.ExerciseDetailModal),
);

/**
 * Zoznam cvikov dňa (plán od trénera aj vlastný) — každý cvik sa dá rozkliknúť
 * na detail s obrázkami a krokmi cvičenia (Free Exercise DB, lib/exercises.ts).
 * Použité na karte Dnes aj v zozname tréningových plánov (/portal/trening).
 */
export function ExercisePreviewList({ exercises }: { exercises: PortalExercise[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [detail, setDetail] = useState<ExerciseDetail | null | undefined>(undefined);
  const [, startTransition] = useTransition();

  const open = (ex: PortalExercise, i: number) => {
    if (!ex.exerciseId) return;
    setOpenIdx(i);
    setDetail(undefined);
    startTransition(async () => {
      const d = await getExerciseDetailAction(ex.exerciseId!);
      setDetail(d);
    });
  };

  const active = openIdx !== null ? exercises[openIdx] : null;

  return (
    <>
      <ol className={styles.exList}>
        {exercises.map((ex, i) => (
          <li key={`${ex.idx}-${i}`} className={styles.exRow}>
            <span className={styles.exIdx}>{ex.idx}</span>
            {ex.exerciseId ? (
              <button type="button" className={styles.exBodyBtn} onClick={() => open(ex, i)}>
                <span className={styles.exBody}>
                  <span className={styles.exName}>{ex.name}</span>
                  <span className={styles.exMeta}>
                    {[ex.scheme, ex.rest && `pauza ${ex.rest}`, ex.tempo && `tempo ${ex.tempo}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </button>
            ) : (
              <span className={styles.exBody}>
                <span className={styles.exName}>{ex.name}</span>
                <span className={styles.exMeta}>
                  {[ex.scheme, ex.rest && `pauza ${ex.rest}`, ex.tempo && `tempo ${ex.tempo}`]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            )}
            {ex.load && <span className={styles.exLoad}>{ex.load}</span>}
          </li>
        ))}
      </ol>
      {active && (
        <ExerciseDetailModal detail={detail} fallbackName={active.name} onClose={() => setOpenIdx(null)} />
      )}
    </>
  );
}
