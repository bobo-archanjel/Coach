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

  return (
    <>
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
                    <span className={styles.metricHistoryWeight}>{e.weightKg != null ? `${e.weightKg} kg` : "—"}</span>
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
