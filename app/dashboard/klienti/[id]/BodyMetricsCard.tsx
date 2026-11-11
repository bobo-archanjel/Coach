import { getTranslations } from "next-intl/server";
import { LineChart, type LineChartPoint } from "../../LineChart";
import type { BodyMetricEntry } from "@/lib/dashboard/bodyMetrics";
import styles from "@/app/dashboard/dashboard.module.css";

/**
 * Váha v čase (feature/progress-analyst) — len na čítanie. Zápis merania robí
 * klient sám v /portal ("Dnes", `BodyMetricForm`), nie tréner — pôvodne to
 * zapisoval tréner priamo tu, presunuté po revízii 2026-09 (klient má vlastné
 * dáta priamo pri sebe, tréner len sleduje trend). Sekcia vnútri karty
 * "Analytika" (`page.tsx`) — nevykresľuje vlastnú `.card`.
 */
export async function BodyMetricsCard({ entries }: { entries: BodyMetricEntry[] }) {
  const t = await getTranslations("clientDetail.body");
  const weightPoints: LineChartPoint[] = entries
    .filter((e) => e.weightKg != null)
    .map((e) => ({ date: e.measuredOn, value: e.weightKg as number }));

  return (
    <div>
      <h4 className={styles.cardSubhead}>{t("weight")}</h4>
      <LineChart points={weightPoints} unit="kg" />
      {weightPoints.length === 0 && (
        <p className={styles.chartHint}>{t("empty")}</p>
      )}
    </div>
  );
}
