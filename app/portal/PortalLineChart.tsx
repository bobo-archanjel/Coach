"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent } from "react";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import s from "./portal.module.css";

/*
 * Čiarový graf portálu (vytiahnutý z karty Progres): body podľa dátumu, ťuk / potiahnutie
 * alebo šípky vyberú bod — hore jeho hodnota a zmena oproti prvému bodu (neutrálne,
 * bez zelenej/červenej). Používa ho karta Progres (merania) aj Analytika tréningu (objem cviku).
 */

/** `note` = doplnok k hodnote vybraného bodu (napr. „× 6 opak.“ pri najťažšej sérii) */
export type LinePoint = { date: string; value: number; note?: string };

const CHART_W = 300;
const CHART_H = 100;
/** od tohto počtu bodov sa bodky nekreslia (len vybraný bod) — graf by bol prepchatý */
const DOTS_MAX = 24;

const isoMs = (iso: string) => new Date(`${iso}T12:00:00Z`).getTime();

export function PortalLineChart({
  points,
  unit,
  label,
  nf,
  locale,
  texts,
}: {
  points: LinePoint[];
  unit: string;
  label: string;
  nf: Intl.NumberFormat;
  locale: Locale;
  /** vlastné texty (napr. objem cviku: „tréning“ namiesto „meranie“) — inak texty karty Progres */
  texts?: { chartAria?: string; single?: string };
}) {
  const t = useTranslations("today.progress");
  const [sel, setSel] = useState(points.length - 1);
  const areaRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  // viac grafov na jednej stránke (Analytika tréningu) — gradient potrebuje jedinečné id
  const fillId = `pg-fill-${useId().replace(/:/g, "")}`;

  const fullDate = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" });
  const shortDate = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "numeric", timeZone: "UTC" });
  const val = (n: number) => `${nf.format(n)} ${unit}`;

  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const t0 = isoMs(points[0].date);
    const span = Math.max(isoMs(points[points.length - 1].date) - t0, 1);
    const vals = points.map((p) => p.value);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    // vzduch nad a pod krivkou; pri malých výkyvoch aspoň 1 jednotka, nech čiara nelieta
    const pad = Math.max((hi - lo) * 0.18, 0.5);
    const min = lo - pad;
    const max = hi + pad;
    const xy = points.map((p) => ({
      x: ((isoMs(p.date) - t0) / span) * CHART_W,
      y: (1 - (p.value - min) / (max - min)) * CHART_H,
    }));
    const line = xy.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
    return {
      xy,
      line,
      area: `${line} L${CHART_W} ${CHART_H} L0 ${CHART_H} Z`,
      ticks: [hi, (hi + lo) / 2, lo].map((v) => ({ v, y: (1 - (v - min) / (max - min)) * 100 })),
    };
  }, [points]);

  if (points.length === 0) {
    return <p className={s.pgEmpty}>{t("noneFor", { metric: label })}</p>;
  }

  const cur = points[Math.min(sel, points.length - 1)];
  const first = points[0];
  const delta = Math.round((cur.value - first.value) * 10) / 10;

  const pickAt = (clientX: number) => {
    const el = areaRef.current;
    if (!el || !geo) return;
    const r = el.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * CHART_W;
    let best = 0;
    for (let i = 1; i < geo.xy.length; i++) {
      if (Math.abs(geo.xy[i].x - x) < Math.abs(geo.xy[best].x - x)) best = i;
    }
    setSel(best);
  };
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pickAt(e.clientX);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current || e.pointerType === "mouse") pickAt(e.clientX);
  };
  const onUp = () => {
    dragging.current = false;
  };
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const next =
      e.key === "ArrowLeft" ? sel - 1 : e.key === "ArrowRight" ? sel + 1 : e.key === "Home" ? 0 : e.key === "End" ? points.length - 1 : null;
    if (next == null) return;
    e.preventDefault();
    setSel(Math.max(0, Math.min(points.length - 1, next)));
  };

  const selXY = geo?.xy[Math.min(sel, geo.xy.length - 1)];

  return (
    <>
      <div className={s.pgHead}>
        <div>
          <p className={s.pgValue}>
            <span className={s.pgNum}>{nf.format(cur.value)}</span>
            <span className={s.pgUnit}>{unit}</span>
          </p>
          <p className={s.pgDate}>
            {fullDate(cur.date)}
            {cur.note ? ` · ${cur.note}` : ""}
          </p>
        </div>
        {points.length > 1 && sel > 0 && (
          <p className={s.pgDelta}>
            <span className={s.pgDeltaVal}>
              {delta === 0 ? t("noChange") : `${delta > 0 ? "↑" : "↓"} ${val(Math.abs(delta))}`}
            </span>
            <span className={s.pgDeltaSince}>{t("since", { date: shortDate(first.date) })}</span>
          </p>
        )}
      </div>

      {geo && selXY ? (
        <>
          <div className={s.pgChart}>
            <div className={s.pgAxis} aria-hidden="true">
              {geo.ticks.map((tk, i) => (
                <span key={i} style={{ top: `${tk.y}%` }}>
                  {nf.format(Math.round(tk.v * 10) / 10)}
                </span>
              ))}
            </div>
            <div
              ref={areaRef}
              className={s.pgArea}
              role="slider"
              tabIndex={0}
              aria-label={texts?.chartAria ?? t("chartAria", { metric: label, count: points.length })}
              aria-valuemin={0}
              aria-valuemax={points.length - 1}
              aria-valuenow={sel}
              aria-valuetext={`${fullDate(cur.date)}: ${val(cur.value)}${cur.note ? ` ${cur.note}` : ""}`}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onKeyDown={onKey}
            >
              {geo.ticks.map((tk, i) => (
                <span key={i} className={s.pgGrid} style={{ top: `${tk.y}%` }} aria-hidden="true" />
              ))}
              <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" className={s.pgStopTop} />
                    <stop offset="100%" className={s.pgStopBottom} />
                  </linearGradient>
                </defs>
                <path d={geo.area} fill={`url(#${fillId})`} />
                <path d={geo.line} className={s.pgLine} />
              </svg>
              <span className={s.pgGuide} style={{ left: `${(selXY.x / CHART_W) * 100}%` }} aria-hidden="true" />
              {points.length <= DOTS_MAX &&
                geo.xy.map((p, i) =>
                  i === sel ? null : (
                    <span
                      key={i}
                      className={s.pgDot}
                      style={{ left: `${(p.x / CHART_W) * 100}%`, top: `${(p.y / CHART_H) * 100}%` }}
                      aria-hidden="true"
                    />
                  ),
                )}
              <span
                className={s.pgDotOn}
                style={{ left: `${(selXY.x / CHART_W) * 100}%`, top: `${(selXY.y / CHART_H) * 100}%` }}
                aria-hidden="true"
              />
            </div>
          </div>
          <div className={s.pgDates} aria-hidden="true">
            <span>{shortDate(first.date)}</span>
            <span>{shortDate(points[points.length - 1].date)}</span>
          </div>
        </>
      ) : (
        <p className={s.pgHint}>{texts?.single ?? t("single")}</p>
      )}
    </>
  );
}
