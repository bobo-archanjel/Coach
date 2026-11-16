"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import type { BodyMetricEntry } from "@/lib/dashboard/bodyMetrics";
import s from "./portal.module.css";

/*
 * Karta „Progres“ na Dnes (pod „Tento týždeň“): graf zo záznamov meraní (body_metrics,
 * rovnaká história ako BodyMetricForm). Predvolene váha; tlačidlo s názvom hodnoty
 * otvorí spodný panel (vzor PlanSwitchSheet) s pásom, hrudníkom, bokmi, pažou a stehnom.
 * Ťuk / potiahnutie po grafe (alebo šípky na klávesnici) vyberie konkrétne meranie —
 * hore sa ukáže jeho hodnota a zmena oproti prvému meraniu. Zmena je zámerne neutrálna
 * (bez zelenej/červenej) — nevieme, či klient chudne, alebo naberá.
 */

type MetricKey = "weight" | "waist" | "chest" | "hips" | "arm" | "thigh";

const METRICS: { key: MetricKey; field: keyof BodyMetricEntry; unit: "kg" | "cm" }[] = [
  { key: "weight", field: "weightKg", unit: "kg" },
  { key: "waist", field: "waistCm", unit: "cm" },
  { key: "chest", field: "chestCm", unit: "cm" },
  { key: "hips", field: "hipsCm", unit: "cm" },
  { key: "arm", field: "armCm", unit: "cm" },
  { key: "thigh", field: "thighCm", unit: "cm" },
];

type Point = { date: string; value: number };

const CHART_W = 300;
const CHART_H = 100;
/** od tohto počtu meraní sa bodky nekreslia (len vybraný bod) — graf by bol prepchatý */
const DOTS_MAX = 24;

const isoMs = (iso: string) => new Date(`${iso}T12:00:00Z`).getTime();

const ChevronDown = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ChartIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 19.5h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M5 15l4.5-4.5 3.5 3L19 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function ProgressCard({ history }: { history: BodyMetricEntry[] }) {
  const t = useTranslations("today.progress");
  const tm = useTranslations("today.metric");
  const locale = useLocale();
  const nf = useMemo(() => new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }), [locale]);

  const series = useMemo(() => {
    const out = {} as Record<MetricKey, Point[]>;
    for (const m of METRICS) {
      out[m.key] = history
        .filter((e) => e[m.field] != null)
        .map((e) => ({ date: e.measuredOn, value: e[m.field] as number }))
        .sort((a, b) => a.date.localeCompare(b.date));
    }
    return out;
  }, [history]);

  // predvolene váha; keď klient váhu nezapisuje, prvá hodnota, ktorá meranie má
  const [metric, setMetric] = useState<MetricKey>(
    () => METRICS.find((m) => series[m.key].length > 0)?.key ?? "weight",
  );
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLButtonElement>(null);

  const anyData = METRICS.some((m) => series[m.key].length > 0);
  const def = METRICS.find((m) => m.key === metric)!;
  const points = series[metric];

  const closeSheet = () => {
    setOpen(false);
    pickerRef.current?.focus();
  };

  return (
    <div className={s.panel} data-tour="today-progress">
      <div className={s.panelHead}>
        <p className={s.panelLabel}>{t("title")}</p>
        {anyData ? (
          <button
            ref={pickerRef}
            type="button"
            className={s.pgPicker}
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-label={t("pickAria", { metric: tm(metric) })}
          >
            {tm(metric)}
            <ChevronDown />
          </button>
        ) : (
          <span className={s.panelIcon}>
            <ChartIcon />
          </span>
        )}
      </div>

      {!anyData ? (
        <p className={s.pgEmpty}>{t("empty")}</p>
      ) : (
        <ProgressChart key={metric} points={points} unit={def.unit} label={tm(metric)} nf={nf} locale={locale} />
      )}

      {open && (
        <MetricSheet
          active={metric}
          series={series}
          nf={nf}
          onPick={(key) => {
            setMetric(key);
            closeSheet();
          }}
          onClose={closeSheet}
        />
      )}
    </div>
  );
}

function ProgressChart({
  points,
  unit,
  label,
  nf,
  locale,
}: {
  points: Point[];
  unit: "kg" | "cm";
  label: string;
  nf: Intl.NumberFormat;
  locale: Locale;
}) {
  const t = useTranslations("today.progress");
  const [sel, setSel] = useState(points.length - 1);
  const areaRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

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
          <p className={s.pgDate}>{fullDate(cur.date)}</p>
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
              aria-label={t("chartAria", { metric: label, count: points.length })}
              aria-valuemin={0}
              aria-valuemax={points.length - 1}
              aria-valuenow={sel}
              aria-valuetext={`${fullDate(cur.date)}: ${val(cur.value)}`}
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
                  <linearGradient id="pg-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" className={s.pgStopTop} />
                    <stop offset="100%" className={s.pgStopBottom} />
                  </linearGradient>
                </defs>
                <path d={geo.area} fill="url(#pg-fill)" />
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
        <p className={s.pgHint}>{t("single")}</p>
      )}
    </>
  );
}

function MetricSheet({
  active,
  series,
  nf,
  onPick,
  onClose,
}: {
  active: MetricKey;
  series: Record<MetricKey, Point[]>;
  nf: Intl.NumberFormat;
  onPick: (key: MetricKey) => void;
  onClose: () => void;
}) {
  const t = useTranslations("today.progress");
  const tm = useTranslations("today.metric");
  const activeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  // Escape zavrie, stránka pod panelom sa neposúva, fokus na aktuálnu hodnotu (ako PlanSwitchSheet).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    activeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const sheet = (
    <div className={s.psLayer}>
      <button type="button" className={s.psScrim} aria-label={t("close")} tabIndex={-1} onClick={onClose} />
      <div className={s.psSheet} role="dialog" aria-modal="true" aria-labelledby="progress-metric-title">
        <div className={s.psHead}>
          <h2 id="progress-metric-title" className={s.psTitle}>
            {t("sheetTitle")}
          </h2>
          <button type="button" className={s.psClose} onClick={onClose} aria-label={t("close")}>
            <CloseIcon />
          </button>
        </div>
        <p className={s.psHint}>{t("sheetHint")}</p>
        <ul className={s.psList}>
          {METRICS.map((m) => {
            const pts = series[m.key];
            const on = m.key === active;
            const last = pts[pts.length - 1];
            return (
              <li key={m.key}>
                <button
                  ref={on ? activeRef : undefined}
                  type="button"
                  className={`${s.psItem} ${on ? s.psItemOn : ""}`}
                  onClick={() => onPick(m.key)}
                  disabled={pts.length === 0}
                  data-empty={pts.length === 0 || undefined}
                  aria-current={on ? "true" : undefined}
                >
                  <span className={s.psItemText}>
                    <span className={s.psItemName}>{tm(m.key)}</span>
                    <span className={s.psItemMeta}>
                      {last ? (
                        <>
                          <span className={s.chip}>{`${nf.format(last.value)} ${m.unit}`}</span>
                          <span className={s.chip}>{t("count", { count: pts.length })}</span>
                        </>
                      ) : (
                        <span className={s.chip}>{t("none")}</span>
                      )}
                    </span>
                  </span>
                  <span className={s.psItemEnd} aria-hidden={!on}>
                    {on ? <CheckIcon /> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );

  return createPortal(sheet, document.querySelector("[data-v6-root]") ?? document.body);
}
