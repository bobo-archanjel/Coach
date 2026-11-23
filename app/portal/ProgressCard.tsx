"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import type { BodyMetricEntry } from "@/lib/dashboard/bodyMetrics";
import { PortalLineChart } from "./PortalLineChart";
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
        <PortalLineChart key={metric} points={points} unit={def.unit} label={tm(metric)} nf={nf} locale={locale as Locale} />
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
