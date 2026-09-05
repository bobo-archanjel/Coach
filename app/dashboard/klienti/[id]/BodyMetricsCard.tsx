import { LineChart, type LineChartPoint } from "../../LineChart";
import type { BodyMetricEntry } from "@/lib/dashboard/bodyMetrics";
import styles from "../../dashboard.module.css";

/**
 * Váha v čase (feature/progress-analyst) — len na čítanie. Zápis merania robí
 * klient sám v /portal ("Dnes", `BodyMetricForm`), nie tréner — pôvodne to
 * zapisoval tréner priamo tu, presunuté po revízii 2026-09 (klient má vlastné
 * dáta priamo pri sebe, tréner len sleduje trend). Sekcia vnútri karty
 * "Analytika" (`page.tsx`) — nevykresľuje vlastnú `.card`.
 */
export function BodyMetricsCard({ entries }: { entries: BodyMetricEntry[] }) {
  const weightPoints: LineChartPoint[] = entries
    .filter((e) => e.weightKg != null)
    .map((e) => ({ date: e.measuredOn, value: e.weightKg as number }));

  return (
    <div>
      <h4 className={styles.cardSubhead}>Váha</h4>
      <LineChart points={weightPoints} unit="kg" />
      {weightPoints.length === 0 && (
        <p className={styles.chartHint}>Klient si zatiaľ nezapísal žiadne meranie — robí to sám v portáli, na karte „Dnes“.</p>
      )}
    </div>
  );
}
