"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { addOwnBodyMetricAction } from "./actions";
import type { BodyMetricEntry } from "@/lib/dashboard/bodyMetrics";
import styles from "./portal.module.css";

interface ActionState {
  error: string | null;
}
const initialState: ActionState = { error: null };

const HISTORY_VISIBLE = 5;

function dateLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("sk-SK", { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" });
}

/** 1 obvod, 2-4 obvody, 5+ obvodov. */
function extrasLabel(n: number): string {
  if (n === 0) return "";
  const word = n === 1 ? "obvod" : n <= 4 ? "obvody" : "obvodov";
  return `+ ${n} ${word}`;
}

function countExtras(e: BodyMetricEntry): number {
  return [e.waistCm, e.chestCm, e.hipsCm, e.armCm, e.thighCm].filter((v) => v != null).length;
}

/**
 * Progres — klient si sám zapíše meranie (váha + voliteľne obvody) priamo na
 * karte Dnes, a hneď pod tým vidí históriu vlastných meraní (aby sa mal k čomu
 * vrátiť — trend dovtedy videl len tréner v Analytike). Predtým zápis robil
 * tréner v dashboarde (feature/progress-analyst) — presunuté po revízii 2026-09.
 * RLS/akcia: `addOwnBodyMetricAction` (0024_body_metrics_client_write.sql).
 * `history` prichádza už zo servera (getPortalData, súčasť Promise.all) —
 * po uložení ju obnoví revalidatePath("/portal","layout") v akcii, žiadny
 * ďalší fetch tu netreba.
 */
export function BodyMetricForm({ today, history }: { today: string; history: BodyMetricEntry[] }) {
  const [state, formAction, pending] = useActionState(addOwnBodyMetricAction, initialState);
  const [open, setOpen] = useState(false);
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  // Zavrieť len po úspešnom uložení — pri okamžitom zatvorení pri submite by
  // prípadná chybová hláška zmizla skôr, než ju klient stihne prečítať.
  useEffect(() => {
    if (state === initialState || state.error) return;
    setOpen(false);
    setShowMeasurements(false);
  }, [state]);

  // Najnovšie prvé — `history` zo servera je najstaršie prvé (rovnaký tvar ako graf).
  const recent = useMemo(() => [...history].reverse(), [history]);
  const visible = showAllHistory ? recent : recent.slice(0, HISTORY_VISIBLE);

  return (
    <>
      {open ? (
        <form action={formAction} className={styles.addPanel}>
          <span className={styles.addPanelLabel}>Nové meranie</span>

          <div className={styles.metricRow}>
            <input type="date" name="measured_on" defaultValue={today} max={today} disabled={pending} className={styles.metricInput} />
            <div className={styles.metricField}>
              <input
                name="weight_kg"
                type="number"
                inputMode="decimal"
                step="0.1"
                placeholder="Váha"
                disabled={pending}
                className={styles.metricInput}
              />
              <span className={styles.gramUnit}>kg</span>
            </div>
          </div>

          {!showMeasurements ? (
            <button type="button" className={styles.metricToggle} onClick={() => setShowMeasurements(true)}>
              + Aj obvody (pás, hrudník, boky, paža, stehno)
            </button>
          ) : (
            <div className={styles.metricRowWrap}>
              <input name="waist_cm" type="number" inputMode="decimal" step="0.1" placeholder="Pás (cm)" disabled={pending} className={styles.metricInputSm} />
              <input name="chest_cm" type="number" inputMode="decimal" step="0.1" placeholder="Hrudník (cm)" disabled={pending} className={styles.metricInputSm} />
              <input name="hips_cm" type="number" inputMode="decimal" step="0.1" placeholder="Boky (cm)" disabled={pending} className={styles.metricInputSm} />
              <input name="arm_cm" type="number" inputMode="decimal" step="0.1" placeholder="Paža (cm)" disabled={pending} className={styles.metricInputSm} />
              <input name="thigh_cm" type="number" inputMode="decimal" step="0.1" placeholder="Stehno (cm)" disabled={pending} className={styles.metricInputSm} />
            </div>
          )}

          <div className={styles.metricActions}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
              {pending ? "Ukladám…" : "Uložiť meranie"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={pending}>
              Zrušiť
            </button>
          </div>
          {state.error && <p className={styles.addError}>{state.error}</p>}
        </form>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" style={{ width: "100%", justifyContent: "center" }} onClick={() => setOpen(true)}>
          + Zapísať meranie
        </button>
      )}

      {recent.length > 0 && (
        <div className={styles.metricHistory}>
          {visible.map((e) => {
            const extras = countExtras(e);
            return (
              <div key={e.measuredOn} className={styles.metricHistoryRow}>
                <span className={styles.metricHistoryDate}>{dateLabel(e.measuredOn)}</span>
                <span className={styles.metricHistoryWeight}>{e.weightKg != null ? `${e.weightKg} kg` : "—"}</span>
                {extras > 0 && <span className={styles.metricHistoryExtra}>{extrasLabel(extras)}</span>}
              </div>
            );
          })}
          {recent.length > HISTORY_VISIBLE && (
            <button type="button" className={styles.metricToggle} onClick={() => setShowAllHistory((s) => !s)}>
              {showAllHistory ? "Zobraziť menej" : `Zobraziť všetky (${recent.length})`}
            </button>
          )}
        </div>
      )}
    </>
  );
}
