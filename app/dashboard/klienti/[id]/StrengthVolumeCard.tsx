"use client";

import { useState } from "react";
import { LineChart, type LineChartPoint } from "../../LineChart";
import type { StrengthPoint, VolumePoint } from "@/lib/dashboard/bodyMetrics";
import styles from "../../dashboard.module.css";

/**
 * Sila (na vybranom cviku) a tréningový objem (feature/progress-analyst). Sekcia
 * vnútri karty "Analytika" (`page.tsx`) — nevykresľuje vlastnú `.card`.
 */
export function StrengthVolumeCard({
  exerciseNames,
  byExercise,
  volumePoints,
}: {
  exerciseNames: string[];
  byExercise: Record<string, StrengthPoint[]>;
  volumePoints: VolumePoint[];
}) {
  const [selected, setSelected] = useState(exerciseNames[0] ?? "");

  const strengthPoints: LineChartPoint[] = (byExercise[selected] ?? []).map((p) => ({ date: p.date, value: p.bestWeightKg }));
  const volumeChartPoints: LineChartPoint[] = volumePoints.map((p) => ({ date: p.date, value: p.volumeKg }));

  return (
    <div>
      <h4 className={styles.cardSubhead}>Sila</h4>
      {exerciseNames.length > 0 ? (
        <>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className={styles.addClientInputSm}
            style={{ marginBottom: 12, width: "100%" }}
            aria-label="Vyber cvik"
          >
            {exerciseNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <LineChart points={strengthPoints} unit="kg" color="var(--plate-yellow)" />
        </>
      ) : (
        <p className={styles.noWorkouts}>
          Klient zatiaľ nezapísal váhu pri žiadnom cviku — graf sily sa objaví, keď pri „Ukončiť tréning“ zadá aspoň jednu
          váhu.
        </p>
      )}

      <h4 className={styles.cardSubhead}>Objem tréningu</h4>
      <LineChart points={volumeChartPoints} unit="kg" color="var(--moss)" />
      <p className={styles.chartHint}>Súčet opakovania × váha naprieč všetkými cvikmi v tréningu, posledných {volumePoints.length || 0} zázname(ov).</p>
    </div>
  );
}
