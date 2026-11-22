"use client";

import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { getWorkoutProgress, subscribeWorkoutProgress } from "./workoutProgress";
import s from "./portal.module.css";

const RING_R = 40;
const RING_CIRC = 2 * Math.PI * RING_R;

/** Prstenec v hlavičke karty Dnes — „2/7 cvikov“. */
export function ProgressRing({ done, total }: { done: number; total: number }) {
  const t = useTranslations("today");
  const fraction = total > 0 ? Math.min(1, done / total) : 0;
  const offset = RING_CIRC * (1 - fraction);
  return (
    <svg
      className={s.ring}
      viewBox="0 0 92 92"
      style={{ ["--ring-circ" as string]: `${RING_CIRC}` }}
      aria-hidden="true"
      data-testid="progress-ring"
      data-done={done}
      data-total={total}
    >
      <circle className={s.ringTrack} cx="46" cy="46" r={RING_R} strokeDasharray={RING_CIRC} />
      <circle className={s.ringStart} cx="46" cy={46 - RING_R} r="4" />
      <circle className={s.ringValue} cx="46" cy="46" r={RING_R} strokeDasharray={RING_CIRC} strokeDashoffset={offset} />
      <text className={s.ringCenter} x="46" y="44" textAnchor="middle" dominantBaseline="middle">
        {done}/{total}
      </text>
      <text className={s.ringCenterSub} x="46" y="59" textAnchor="middle" dominantBaseline="middle">
        {t("exercisesRing")}
      </text>
    </svg>
  );
}

/**
 * Prstenec počas tréningu: živý postup z formulára sérií (odškrtnuté cviky / všetky vrátane
 * pridaných, workoutProgress.ts); kým tréning nebeží, hodnoty zo servera.
 */
export function LiveProgressRing({ dayId, done, total }: { dayId: string; done: number; total: number }) {
  const live = useSyncExternalStore(subscribeWorkoutProgress, getWorkoutProgress, () => null);
  const p = live && live.dayId === dayId ? live : { done, total };
  return <ProgressRing done={p.done} total={p.total} />;
}
