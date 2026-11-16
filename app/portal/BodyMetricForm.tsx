"use client";

import { useLocale, useTranslations } from "next-intl";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import { startTransition, useActionState, useEffect, useMemo, useOptimistic, useState, type FormEvent } from "react";
import { addOwnBodyMetricAction } from "./actions";
import type { BodyMetricEntry } from "@/lib/dashboard/bodyMetrics";
import styles from "./portal.module.css";

interface ActionState {
  error: string | null;
}
const initialState: ActionState = { error: null };

function dateLabel(iso: string, locale: Locale): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" });
}

const EXTRA_FIELDS: { key: keyof BodyMetricEntry; label: "waist" | "chest" | "hips" | "arm" | "thigh" }[] = [
  { key: "waistCm", label: "waist" },
  { key: "chestCm", label: "chest" },
  { key: "hipsCm", label: "hips" },
  { key: "armCm", label: "arm" },
  { key: "thighCm", label: "thigh" },
];

/** "Pás 82 cm · Boky 95 cm" — len zadané obvody, v poradí ako vo formulári. */
function extrasSummary(e: BodyMetricEntry, label: (k: (typeof EXTRA_FIELDS)[number]["label"]) => string): string {
  return EXTRA_FIELDS.filter(({ key }) => e[key] != null)
    .map(({ key, label: k }) => `${label(k)} ${e[key]} cm`)
    .join(" · ");
}

/**
 * Progres — klient si sám zapíše meranie (váha + voliteľne obvody) priamo na
 * karte Dnes, a hneď pod tým vidí históriu vlastných meraní (aby sa mal k čomu
 * vrátiť — trend dovtedy videl len tréner v Analytike). Predtým zápis robil
 * tréner v dashboarde (feature/progress-analyst) — presunuté po revízii 2026-09.
 * RLS/akcia: `addOwnBodyMetricAction` (0024_body_metrics_client_write.sql).
 * `history` prichádza už zo servera (getPortalData, súčasť Promise.all) —
 * po uložení ju obnoví revalidatePath("/portal","layout") v akcii, žiadny
 * ďalší fetch tu netreba. Zoznam sa vždy renderuje celý (žiadne "Zobraziť
 * všetky" prepínanie dĺžky) — nad 3 záznamy `.metricHistoryList` interne
 * skroluje (max-height), aby karta Dnes nerástla donekonečna.
 */
export function BodyMetricForm({ today, history }: { today: string; history: BodyMetricEntry[] }) {
  const t = useTranslations("today.metric");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(addOwnBodyMetricAction, initialState);
  const [open, setOpen] = useState(false);
  const [showMeasurements, setShowMeasurements] = useState(false);

  // Okamžite zobrazí zapísané meranie v histórii, bez čakania na round-trip +
  // revalidatePath. Server má na `measured_on` upsert (rovnaký deň = úprava,
  // nie duplicita) — optimistic reducer robí to isté: nahradí záznam s rovnakým
  // dátumom, inak pridá nový. Pri chybe/revalidácii React sám zahodí optimistic
  // vrstvu a vráti sa na skutočné `history` z props.
  const [optimisticHistory, addOptimisticEntry] = useOptimistic<BodyMetricEntry[], BodyMetricEntry>(
    history,
    (curr, entry) => {
      const rest = curr.filter((e) => e.measuredOn !== entry.measuredOn);
      return [...rest, entry].sort((a, b) => a.measuredOn.localeCompare(b.measuredOn));
    },
  );

  // Zavrieť len po úspešnom uložení — pri okamžitom zatvorení pri submite by
  // prípadná chybová hláška zmizla skôr, než ju klient stihne prečítať.
  useEffect(() => {
    if (state === initialState || state.error) return;
    setOpen(false);
    setShowMeasurements(false);
  }, [state]);

  function num(fd: FormData, key: string): number | null {
    const raw = fd.get(key);
    if (typeof raw !== "string" || raw.trim() === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const entry: BodyMetricEntry = {
      measuredOn: (fd.get("measured_on") as string) || today,
      weightKg: num(fd, "weight_kg"),
      waistCm: num(fd, "waist_cm"),
      chestCm: num(fd, "chest_cm"),
      hipsCm: num(fd, "hips_cm"),
      armCm: num(fd, "arm_cm"),
      thighCm: num(fd, "thigh_cm"),
      note: null,
    };
    if (
      entry.weightKg == null &&
      entry.waistCm == null &&
      entry.chestCm == null &&
      entry.hipsCm == null &&
      entry.armCm == null &&
      entry.thighCm == null
    ) {
      return; // rovnaká validácia ako server — nech optimistic vrstva nepridá prázdny riadok
    }
    startTransition(() => {
      addOptimisticEntry(entry);
      formAction(fd);
    });
  }

  // Najnovšie prvé — `history` zo servera je najstaršie prvé (rovnaký tvar ako graf).
  const recent = useMemo(() => [...optimisticHistory].reverse(), [optimisticHistory]);
  const weights = useMemo(
    () => optimisticHistory.filter((e): e is BodyMetricEntry & { weightKg: number } => e.weightKg != null),
    [optimisticHistory],
  );
  const kg = (n: number) => n.toLocaleString(intlLocale(locale), { maximumFractionDigits: 1 });

  return (
    <>
      {weights.length > 0 && <WeightSummary weights={weights} locale={locale} kg={kg} />}

      {open ? (
        <form onSubmit={handleSubmit} className={styles.addPanel}>
          <span className={styles.addPanelLabel}>{t("newMeasurement")}</span>

          <div className={styles.metricRow}>
            <input type="date" name="measured_on" defaultValue={today} max={today} disabled={pending} className={styles.metricInput} />
            <div className={styles.metricField}>
              <input
                name="weight_kg"
                type="number"
                inputMode="decimal"
                step="0.1"
                placeholder={t("weight")}
                disabled={pending}
                className={styles.metricInput}
              />
              <span className={styles.gramUnit}>kg</span>
            </div>
          </div>

          {!showMeasurements ? (
            <button type="button" className={styles.metricToggle} onClick={() => setShowMeasurements(true)}>
              {t("withCircumferences")}
            </button>
          ) : (
            <div className={styles.metricRowWrap}>
              <input name="waist_cm" type="number" inputMode="decimal" step="0.1" placeholder={t("waistCm")} disabled={pending} className={styles.metricInputSm} />
              <input name="chest_cm" type="number" inputMode="decimal" step="0.1" placeholder={t("chestCm")} disabled={pending} className={styles.metricInputSm} />
              <input name="hips_cm" type="number" inputMode="decimal" step="0.1" placeholder={t("hipsCm")} disabled={pending} className={styles.metricInputSm} />
              <input name="arm_cm" type="number" inputMode="decimal" step="0.1" placeholder={t("armCm")} disabled={pending} className={styles.metricInputSm} />
              <input name="thigh_cm" type="number" inputMode="decimal" step="0.1" placeholder={t("thighCm")} disabled={pending} className={styles.metricInputSm} />
            </div>
          )}

          <div className={styles.metricActions}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
              {pending ? t("saving") : t("save")}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={pending}>
              {t("cancel")}
            </button>
          </div>
          {state.error && <p className={styles.addError}>{state.error}</p>}
        </form>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" style={{ width: "100%", justifyContent: "center" }} onClick={() => setOpen(true)}>
          {t("add")}
        </button>
      )}

      {recent.length > 0 && (
        <div className={styles.metricHistory}>
          <div className={styles.metricHistoryList}>
            {recent.map((e) => {
              const extras = extrasSummary(e, (k) => t(k));
              return (
                <div key={e.measuredOn} className={styles.metricHistoryRow}>
                  <div className={styles.metricHistoryMain}>
                    <span className={styles.metricHistoryDate}>{dateLabel(e.measuredOn, locale)}</span>
                    <span className={styles.metricHistoryWeight}>{e.weightKg != null ? `${kg(e.weightKg)} kg` : "—"}</span>
                  </div>
                  {extras && <p className={styles.metricHistoryExtra}>{extras}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

type WeightPoint = BodyMetricEntry & { weightKg: number };

const DAY_MS = 86_400_000;
const CHART_POINTS = 12;
const CHART_W = 300;
const CHART_H = 64;
const CHART_PAD = 5;

const isoMs = (iso: string) => new Date(`${iso}T12:00:00Z`).getTime();

/**
 * Súhrn váhy nad formulárom: aktuálna váha, zmena od merania spred ~30 dní (alebo od
 * prvého, keď také staré nie je) a malý graf posledných meraní. Zmena je zámerne
 * neutrálna (bez zelenej/červenej) — nevieme, či klient chudne alebo naberá.
 * Z optimistickej histórie, takže sa prekreslí hneď po zápise.
 */
function WeightSummary({ weights, locale, kg }: { weights: WeightPoint[]; locale: Locale; kg: (n: number) => string }) {
  const t = useTranslations("today.metric");
  const latest = weights[weights.length - 1];
  const cutoff = isoMs(latest.measuredOn) - 30 * DAY_MS;
  const older = weights.filter((w) => isoMs(w.measuredOn) <= cutoff);
  const baseline = weights.length > 1 ? (older[older.length - 1] ?? weights[0]) : null;
  const delta = baseline ? Math.round((latest.weightKg - baseline.weightKg) * 10) / 10 : 0;
  const shortDate = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "numeric", timeZone: "UTC" });

  const series = weights.slice(-CHART_POINTS);
  let chart: { line: string; area: string; last: [number, number] } | null = null;
  if (series.length > 1) {
    const t0 = isoMs(series[0].measuredOn);
    const span = Math.max(isoMs(series[series.length - 1].measuredOn) - t0, 1);
    const vals = series.map((w) => w.weightKg);
    const min = Math.min(...vals);
    const range = Math.max(Math.max(...vals) - min, 1); // pri malých výkyvoch nech čiara nelieta po celej výške
    const pts = series.map((w): [number, number] => [
      CHART_PAD + ((isoMs(w.measuredOn) - t0) / span) * (CHART_W - 2 * CHART_PAD),
      CHART_PAD + (1 - (w.weightKg - min) / range) * (CHART_H - 2 * CHART_PAD),
    ]);
    const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    chart = {
      line,
      area: `${line} L${pts[pts.length - 1][0].toFixed(1)} ${CHART_H} L${pts[0][0].toFixed(1)} ${CHART_H} Z`,
      last: pts[pts.length - 1],
    };
  }

  return (
    <div className={styles.weightSummary}>
      <div className={styles.weightHead}>
        <p className={styles.weightNow}>
          <span className={styles.weightNum}>{kg(latest.weightKg)}</span>
          <span className={styles.weightUnit}>kg</span>
        </p>
        {baseline && (
          <p className={styles.weightDelta}>
            <span className={styles.weightDeltaVal}>
              {delta === 0 ? t("noChange") : `${delta > 0 ? "↑" : "↓"} ${kg(Math.abs(delta))} kg`}
            </span>
            <span className={styles.weightDeltaSince}>{t("since", { date: shortDate(baseline.measuredOn) })}</span>
          </p>
        )}
      </div>
      {chart && (
        // SVG sa naťahuje na šírku karty (preserveAspectRatio none, čiara bez škálovania
        // hrúbky) — bod je preto HTML prvok, v SVG by sa na počítači rozťahal na elipsu.
        <div
          className={styles.weightChart}
          role="img"
          aria-label={t("chartAria", { from: kg(series[0].weightKg), to: kg(latest.weightKg) })}
        >
          <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" aria-hidden="true">
            <path d={chart.area} className={styles.weightChartArea} />
            <path d={chart.line} className={styles.weightChartLine} />
          </svg>
          <span
            className={styles.weightChartDot}
            style={{ left: `${(chart.last[0] / CHART_W) * 100}%`, top: `${(chart.last[1] / CHART_H) * 100}%` }}
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
}
