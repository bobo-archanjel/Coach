"use client";

import { useId, useMemo, useState } from "react";
import styles from "./dashboard.module.css";

export interface LineChartPoint {
  /** YYYY-MM-DD */
  date: string;
  value: number;
}

/**
 * Jednosériový SVG line chart (progres váhy/sily/objemu — Progres a analýza,
 * feature/progress-analyst). Jedna séria nepotrebuje legendu (dataviz skill —
 * názov karty ju nesie), preto len tenká čiara + priamy label na poslednom bode
 * + hover crosshair s tooltipom. Recesívna mriežka (len baseline), žiadne osi.
 */
export function LineChart({
  points,
  unit,
  color = "var(--iron-red)",
  height = 160,
}: {
  points: LineChartPoint[];
  unit: string;
  /** CSS farba čiary — token, nie hex (napr. "var(--iron-red)"). */
  color?: string;
  height?: number;
}) {
  const gradientId = useId();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const W = 600;
  const H = height;
  const padX = 8;
  const padTop = 20;
  const padBottom = 8;

  const { path, areaPath, coords, min, max } = useMemo(() => {
    if (points.length === 0) return { path: "", areaPath: "", coords: [] as { x: number; y: number }[], min: 0, max: 0 };
    const values = points.map((p) => p.value);
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    if (lo === hi) {
      // Plochá séria (jeden bod alebo všetky rovnaké) — umelý rozsah, nech čiara nie je na okraji.
      lo -= 1;
      hi += 1;
    }
    const innerW = W - padX * 2;
    const innerH = H - padTop - padBottom;
    const xStep = points.length > 1 ? innerW / (points.length - 1) : 0;
    const coords = points.map((p, i) => ({
      x: padX + i * xStep,
      y: padTop + innerH - ((p.value - lo) / (hi - lo)) * innerH,
    }));
    const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
    const areaPath = `${path} L${coords[coords.length - 1].x.toFixed(1)},${H - padBottom} L${coords[0].x.toFixed(1)},${H - padBottom} Z`;
    return { path, areaPath, coords, min: lo, max: hi };
  }, [points, H, padTop, padBottom]);

  if (points.length === 0) {
    return <p className={styles.chartEmpty}>Zatiaľ žiadne dáta na graf.</p>;
  }

  const last = points[points.length - 1];
  const lastCoord = coords[coords.length - 1];
  const hovered = hoverIdx != null ? points[hoverIdx] : null;
  const hoveredCoord = hoverIdx != null ? coords[hoverIdx] : null;

  const handleMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    let nearest = 0;
    let bestDist = Infinity;
    coords.forEach((c, i) => {
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
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={styles.chartSvg}
        onPointerMove={handleMove}
        onPointerLeave={() => setHoverIdx(null)}
        role="img"
        aria-label={`Graf, posledná hodnota ${last.value} ${unit}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.16" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* baseline — jediná mriežková čiara, recesívna */}
        <line x1={padX} y1={H - padBottom} x2={W - padX} y2={H - padBottom} stroke="var(--steel-line)" strokeWidth="1" />

        <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* priamy label na poslednom bode — jediný trvalý label, nie na každom bode */}
        <circle cx={lastCoord.x} cy={lastCoord.y} r="4" fill={color} />

        {hoveredCoord && (
          <>
            <line
              x1={hoveredCoord.x}
              y1={padTop}
              x2={hoveredCoord.x}
              y2={H - padBottom}
              stroke="var(--paper-faint)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <circle cx={hoveredCoord.x} cy={hoveredCoord.y} r="5" fill="var(--ink)" stroke={color} strokeWidth="2" />
          </>
        )}
      </svg>

      <div className={styles.chartLastLabel} style={{ color }}>
        {last.value} {unit}
        <span className={styles.chartLastDate}>{dateLabel(last.date)}</span>
      </div>

      {hovered && hoverIdx !== points.length - 1 && (
        <div className={styles.chartTooltip} style={{ left: `${(hoveredCoord!.x / W) * 100}%` }}>
          <strong>
            {hovered.value} {unit}
          </strong>
          <span>{dateLabel(hovered.date)}</span>
        </div>
      )}

      <p className={styles.chartRange}>
        {Math.round(min)}–{Math.round(max)} {unit} · {points.length} záznamov
      </p>
    </div>
  );
}
