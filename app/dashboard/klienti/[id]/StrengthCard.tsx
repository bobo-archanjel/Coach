"use client";

import { useMemo, useState } from "react";
import { DualLineChart, type DualLineChartPoint } from "../../DualLineChart";
import type { StrengthPoint } from "@/lib/dashboard/bodyMetrics";
import styles from "../../dashboard.module.css";

const UpIcon = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M6 10V2M6 2 2.5 5.5M6 2l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const DownIcon = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M6 2v8M6 10l3.5-3.5M6 10 2.5 6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Sila (na vybranom cviku) — feature/progress-analyst. Jeden graf s dvomi
 * krivkami (váha + opakovania, DualLineChart) namiesto dvoch samostatných —
 * na priamy súbežný pohľad na trend, ako si vyžiadal používateľ pri revízii
 * 2026-09. Objem tréningu (predtým súčasť tohto súboru) odstránený — hodnotené
 * ako nadbytočné oproti trendu sily na konkrétnom cviku. Sekcia vnútri karty
 * "Analytika" (`page.tsx`) — nevykresľuje vlastnú `.card`.
 */
export function StrengthCard({
  exerciseNames,
  byExercise,
}: {
  exerciseNames: string[];
  byExercise: Record<string, StrengthPoint[]>;
}) {
  const [selected, setSelected] = useState(exerciseNames[0] ?? "");

  const points: DualLineChartPoint[] = (byExercise[selected] ?? []).map((p) => ({
    date: p.date,
    a: p.bestWeightKg,
    b: p.reps,
  }));

  // Trend = zmena váhy od prvého po posledný zaznamenaný tréning na tomto cviku —
  // opakovania sú kontext v grafe, ale hlavný signál "silnie/slabne" nesie váha.
  const trend = useMemo(() => {
    if (points.length < 2) return null;
    const first = points[0].a;
    const last = points[points.length - 1].a;
    if (first === 0) return null;
    const pct = Math.round(((last - first) / first) * 100);
    return pct;
  }, [points]);

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

          {trend != null && (
            <p className={`${styles.strengthTrend} ${trend > 0 ? styles.strengthTrendUp : trend < 0 ? styles.strengthTrendDown : styles.strengthTrendFlat}`}>
              {trend > 0 ? <UpIcon /> : trend < 0 ? <DownIcon /> : null}
              {trend > 0 ? "+" : ""}
              {trend}&nbsp;% váhy za sledované obdobie
            </p>
          )}

          <DualLineChart
            points={points}
            seriesA={{ label: "Váha", unit: "kg", color: "var(--plate-yellow)" }}
            seriesB={{ label: "Opakovania", unit: "op.", color: "var(--moss)" }}
          />
          <p className={styles.chartHint}>Najťažšia séria pri každom zázname tréningu s týmto cvikom.</p>
        </>
      ) : (
        <p className={styles.noWorkouts}>
          Klient zatiaľ nezapísal váhu pri žiadnom cviku — graf sily sa objaví, keď pri „Ukončiť tréning“ zadá aspoň jednu
          váhu.
        </p>
      )}
    </div>
  );
}
