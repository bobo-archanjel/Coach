"use client";

import { useId, useMemo, useState } from "react";
import styles from "./dashboard.module.css";

export interface DualLineChartPoint {
  /** YYYY-MM-DD */
  date: string;
  a: number;
  b: number;
}

interface Series {
  label: string;
  unit: string;
  color: string;
}

/**
 * Dvojsériový SVG line chart — progres sily na vybranom cviku (feature/progress-analyst):
 * váha (séria A) a opakovania (séria B) v čase, každá na vlastnej mierke (jednotky sa
 * líšia rádovo), keďže obe naraz v jednom grafe si vyžiadal používateľ namiesto dvoch
 * samostatných grafov. Dve série = legenda navyše (na rozdiel od LineChart, kde ju
 * jednosériový graf nepotrebuje — viď dataviz skill).
 */
export function DualLineChart({
  points,
  seriesA,
  seriesB,
  height = 170,
}: {
  points: DualLineChartPoint[];
  seriesA: Series;
  seriesB: Series;
  height?: number;
}) {
  const gradientIdA = useId();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const W = 600;
  const H = height;
  const padX = 8;
  const padTop = 20;
  const padBottom = 8;

  const { coordsA, coordsB, pathA, pathB } = useMemo(() => {
    if (points.length === 0) {
      return { coordsA: [] as { x: number; y: number }[], coordsB: [] as { x: number; y: number }[], pathA: "", pathB: "" };
    }
    const innerW = W - padX * 2;
    const innerH = H - padTop - padBottom;
    const xStep = points.length > 1 ? innerW / (points.length - 1) : 0;

    const scale = (values: number[]) => {
      let lo = Math.min(...values);
      let hi = Math.max(...values);
      if (lo === hi) {
        lo -= 1;
        hi += 1;
      }
      return (v: number) => padTop + innerH - ((v - lo) / (hi - lo)) * innerH;
    };
    const yA = scale(points.map((p) => p.a));
    const yB = scale(points.map((p) => p.b));

    const coordsA = points.map((p, i) => ({ x: padX + i * xStep, y: yA(p.a) }));
    const coordsB = points.map((p, i) => ({ x: padX + i * xStep, y: yB(p.b) }));
    const toPath = (coords: { x: number; y: number }[]) =>
      coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

    return { coordsA, coordsB, pathA: toPath(coordsA), pathB: toPath(coordsB) };
  }, [points, H, padTop, padBottom]);

  if (points.length === 0) {
    return <p className={styles.chartEmpty}>Zatiaľ žiadne dáta na graf.</p>;
  }

  const last = points[points.length - 1];
  const lastA = coordsA[coordsA.length - 1];
  const lastB = coordsB[coordsB.length - 1];
  const hovered = hoverIdx != null ? points[hoverIdx] : null;
  const hoveredA = hoverIdx != null ? coordsA[hoverIdx] : null;
  const hoveredB = hoverIdx != null ? coordsB[hoverIdx] : null;

  const handleMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    let nearest = 0;
    let bestDist = Infinity;
    coordsA.forEach((c, i) => {
      const d = Math.abs(c.x - relX);
      if (d < bestDist) {
        bestDist = d;
        nearest = i;
      }
    });
    setHoverIdx(nearest);
  };

  const dateLabel = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString("sk-SK", { day: "numeric", month: "numeric", timeZone: "UTC" });

  return (
    <div className={styles.chartWrap}>
      <div className={styles.chartLegend}>
        <span className={styles.chartLegendItem}>
          <span className={styles.chartLegendDot} style={{ background: seriesA.color }} />
          {seriesA.label}
        </span>
        <span className={styles.chartLegendItem}>
          <span className={styles.chartLegendDot} style={{ background: seriesB.color }} />
          {seriesB.label}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={styles.chartSvg}
        onPointerMove={handleMove}
        onPointerLeave={() => setHoverIdx(null)}
        role="img"
        aria-label={`Graf, posledná hodnota ${seriesA.label} ${last.a} ${seriesA.unit}, ${seriesB.label} ${last.b} ${seriesB.unit}`}
      >
        <defs>
          <linearGradient id={gradientIdA} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={seriesA.color} stopOpacity="0.14" />
            <stop offset="100%" stopColor={seriesA.color} stopOpacity="0" />
          </linearGradient>
        </defs>

        <line x1={padX} y1={H - padBottom} x2={W - padX} y2={H - padBottom} stroke="var(--steel-line)" strokeWidth="1" />

        <path d={pathB} fill="none" stroke={seriesB.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 3" opacity="0.85" />
        <path d={pathA} fill="none" stroke={seriesA.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        <circle cx={lastA.x} cy={lastA.y} r="4" fill={seriesA.color} />
        <circle cx={lastB.x} cy={lastB.y} r="3.5" fill={seriesB.color} />

        {hoveredA && hoveredB && (
          <>
            <line
              x1={hoveredA.x}
              y1={padTop}
              x2={hoveredA.x}
              y2={H - padBottom}
              stroke="var(--paper-faint)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <circle cx={hoveredA.x} cy={hoveredA.y} r="5" fill="var(--ink)" stroke={seriesA.color} strokeWidth="2" />
            <circle cx={hoveredB.x} cy={hoveredB.y} r="4.5" fill="var(--ink)" stroke={seriesB.color} strokeWidth="2" />
          </>
        )}
      </svg>

      <div className={styles.chartLastLabel} style={{ color: seriesA.color }}>
        {last.a} {seriesA.unit}
        <span className={styles.chartLastDate}>{dateLabel(last.date)}</span>
      </div>

      {hovered && hoverIdx !== points.length - 1 && (
        <div className={styles.chartTooltip} style={{ left: `${(hoveredA!.x / W) * 100}%` }}>
          <strong style={{ color: seriesA.color }}>
            {hovered.a} {seriesA.unit}
          </strong>
          <strong style={{ color: seriesB.color }}>
            {hovered.b} {seriesB.unit}
          </strong>
          <span>{dateLabel(hovered.date)}</span>
        </div>
      )}

      <p className={styles.chartRange}>{points.length} záznamov</p>
    </div>
  );
}
