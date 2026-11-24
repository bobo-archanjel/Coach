"use client";

import { useId, useState } from "react";
import styles from "@/app/dashboard/dashboard.module.css";
import rs from "./reports.module.css";

/**
 * Stĺpcový graf pre reporty (adherencia po týždňoch, spolupráce po mesiacoch, príjem kcal) — ľahké
 * SVG bez knižnice, rovnaký jazyk ako LineChart: žiadne osi, jedna základná čiara, priame
 * hodnoty nad stĺpcami pri málo stĺpcoch, tooltip pri ukázaní/ťuknutí. Viac sérií = zoskupené
 * stĺpce s legendou (farba nikdy nenesie význam sama — legenda aj tooltip majú text).
 * Prístupnosť: `role="img"` s popisom + skrytá tabuľka s presnými hodnotami pre čítačky.
 */
export interface BarGroup {
  /** krátky popisok pod stĺpcom (os x) */
  label: string;
  /** hodnota na sériu; null = bez údaja (stĺpec sa nekreslí) */
  values: (number | null)[];
  /** celý názov skupiny do tooltipu / skrytej tabuľky */
  title: string;
  /** hotové riadky tooltipu (formátuje rodič, nech graf nepozná jednotky) */
  lines: string[];
}

export interface BarSeries {
  label: string;
  /** CSS farba — token, nie hex (napr. "var(--accent)") */
  color: string;
}

export function ReportBarChart({
  groups,
  series,
  max,
  refLine,
  ariaLabel,
  height = 168,
  showValues,
  formatValue = (v) => String(v),
}: {
  groups: BarGroup[];
  series: BarSeries[];
  /** horná hranica osi; predvolene najväčšia hodnota */
  max?: number;
  /** vodorovná vodiaca čiara (napr. cieľ kcal) */
  refLine?: { value: number; label: string };
  ariaLabel: string;
  height?: number;
  /** hodnoty nad stĺpcami; predvolene len pri ≤ 14 skupinách s jednou sériou */
  showValues?: boolean;
  formatValue?: (v: number) => string;
}) {
  const uid = useId();
  const [hover, setHover] = useState<number | null>(null);

  const W = 600;
  const H = height;
  const padX = 6;
  const padTop = 22;
  const padBottom = 24;
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;
  const n = groups.length;
  const allValues = groups.flatMap((g) => g.values.filter((v): v is number => v != null));
  const top = Math.max(max ?? 0, ...allValues, refLine?.value ?? 0, 1);
  const slot = n > 0 ? innerW / n : innerW;
  const barArea = slot * 0.72;
  const barW = barArea / Math.max(1, series.length);
  const labelEvery = n <= 12 ? 1 : n <= 26 ? 2 : Math.ceil(n / 12);
  const valuesOn = showValues ?? (n <= 14 && series.length === 1);
  const y = (v: number) => padTop + innerH - (v / top) * innerH;

  const handleMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W - padX;
    setHover(Math.min(n - 1, Math.max(0, Math.floor(relX / slot))));
  };

  const hovered = hover != null ? groups[hover] : null;
  const hoverLeftPct = hover != null ? ((padX + slot * (hover + 0.5)) / W) * 100 : 0;

  return (
    <div className={styles.chartWrap}>
      {series.length > 1 && (
        <div className={styles.chartLegend}>
          {series.map((s) => (
            <span key={s.label} className={styles.chartLegendItem}>
              <span className={styles.chartLegendDot} style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={styles.chartSvg}
        onPointerMove={handleMove}
        onPointerDown={handleMove}
        onPointerLeave={() => setHover(null)}
        // ťah prstom posúva ukazovateľ hodnoty — nie gesto „späť“ (SwipeBack)
        data-no-swipe
        role="img"
        aria-label={ariaLabel}
        aria-describedby={`${uid}-table`}
      >
        <line x1={padX} x2={W - padX} y1={y(0)} y2={y(0)} stroke="var(--hairline)" strokeWidth="1" />
        {refLine && (
          <g>
            <line x1={padX} x2={W - padX} y1={y(refLine.value)} y2={y(refLine.value)} stroke="var(--paper-faint)" strokeWidth="1" strokeDasharray="4 4" />
            <text x={W - padX} y={y(refLine.value) - 4} textAnchor="end" fontSize="10.5" fill="var(--paper-faint)">
              {refLine.label}
            </text>
          </g>
        )}
        {groups.map((g, gi) => {
          const x0 = padX + slot * gi + (slot - barArea) / 2;
          return (
            <g key={gi} opacity={hover == null || hover === gi ? 1 : 0.55}>
              {g.values.map((v, si) => {
                if (v == null) return null;
                const h = Math.max(v > 0 ? 2 : 0, (v / top) * innerH);
                return (
                  <rect
                    key={si}
                    x={x0 + si * barW + (series.length > 1 ? 0.5 : 0)}
                    y={y(0) - h}
                    width={Math.max(1, barW - (series.length > 1 ? 1 : 0))}
                    height={h}
                    rx={Math.min(4, barW / 3)}
                    fill={series[si]?.color ?? "var(--accent)"}
                  />
                );
              })}
              {valuesOn &&
                g.values.map((v, si) =>
                  v == null ? null : (
                    <text key={`t${si}`} x={x0 + si * barW + barW / 2} y={y(v) - 4} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="var(--paper-dim)">
                      {formatValue(v)}
                    </text>
                  ),
                )}
              {gi % labelEvery === 0 && (
                <text x={padX + slot * (gi + 0.5)} y={H - 7} textAnchor="middle" fontSize="10.5" fill="var(--paper-faint)">
                  {g.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hovered && (
        <div className={styles.chartTooltip} style={{ left: `${hoverLeftPct}%` }}>
          <strong>{hovered.title}</strong>
          {hovered.lines.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      )}
      <table id={`${uid}-table`} className={rs.srOnly}>
        <caption>{ariaLabel}</caption>
        <tbody>
          {groups.map((g, i) => (
            <tr key={i}>
              <th scope="row">{g.title}</th>
              <td>{g.lines.join("; ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
