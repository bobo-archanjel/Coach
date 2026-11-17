"use client";

import { Fragment, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { supersetPositions } from "@/lib/workouts/superset";
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
  const t = useTranslations("training.preview");
  const positions = supersetPositions(exercises);

  return (
    <>
      <ol className={styles.exList}>
        {exercises.map((ex, i) => {
          const ss = positions[i];
          // v supersérii medzi cvikmi bez pauzy — pauza až po kole (pauza posledného cviku)
          const meta = [
            ex.scheme,
            ss && !ss.last
              ? t("ssNext", { next: `${ss.letter}${ss.index + 1}` })
              : ss
                ? ex.rest
                  ? t("ssRoundRest", { rest: ex.rest })
                  : t("ssRoundNoRest")
                : ex.rest && t("rest", { rest: ex.rest }),
          ]
            .filter(Boolean)
            .join(" · ");
          const body = (
            <span className={styles.exBody}>
              <span className={styles.exName}>{ex.name}</span>
              <span className={`${styles.exMeta} ${ss ? styles.exMetaSs : ""}`}>{meta}</span>
              {ex.tempo && <span className={styles.exNote}>„{ex.tempo}“</span>}
            </span>
          );
          return (
            <Fragment key={`${ex.idx}-${i}`}>
              {ss?.first && (
                <li className={styles.exSsHead} aria-hidden="true">
                  {t("ssHeader", { letter: ss.letter })}
                </li>
              )}
              <li className={`${styles.exRow} ${ss ? styles.exRowSs : ""}`} data-superset={ss ? `${ss.letter}${ss.index}` : undefined}>
                <span className={`${styles.exIdx} ${ss ? styles.exIdxSs : ""}`}>{ss ? `${ss.letter}${ss.index}` : ex.idx}</span>
                {ex.exerciseId ? (
                  <button type="button" className={styles.exBodyBtn} onClick={() => open(ex, i)}>
                    {body}
                  </button>
                ) : (
                  body
                )}
                {ex.load && <span className={styles.exLoad}>{ex.load}</span>}
              </li>
            </Fragment>
          );
        })}
      </ol>
      {active && (
        <ExerciseDetailModal detail={detail} fallbackName={active.name} onClose={() => setOpenIdx(null)} />
      )}
    </>
  );
}
