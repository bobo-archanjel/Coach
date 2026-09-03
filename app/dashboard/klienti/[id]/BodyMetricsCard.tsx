"use client";

import { useActionState, useEffect, useState } from "react";
import { addBodyMetricAction, type ActionState } from "../actions";
import { LineChart, type LineChartPoint } from "../../LineChart";
import type { BodyMetricEntry } from "@/lib/dashboard/bodyMetrics";
import styles from "../../dashboard.module.css";

const initialState: ActionState = { error: null };

/**
 * Váha v čase + rýchly zápis nového merania (feature/progress-analyst). Sekcia
 * vnútri karty "Analytika" (`page.tsx`) — nevykresľuje vlastnú `.card`.
 */
export function BodyMetricsCard({ clientId, entries }: { clientId: string; entries: BodyMetricEntry[] }) {
  const [state, formAction, pending] = useActionState(addBodyMetricAction, initialState);
  const [open, setOpen] = useState(false);
  const [showMeasurements, setShowMeasurements] = useState(false);

  // Formulár zavrieť len po ÚSPEŠNOM uložení — zatvoriť ho hneď pri submite by
  // skrylo prípadnú chybovú hlášku skôr, než sa vôbec zobrazí.
  useEffect(() => {
    if (state === initialState || state.error) return;
    setOpen(false);
    setShowMeasurements(false);
  }, [state]);

  const weightPoints: LineChartPoint[] = entries
    .filter((e) => e.weightKg != null)
    .map((e) => ({ date: e.measuredOn, value: e.weightKg as number }));

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <h4 className={styles.cardSubhead}>Váha</h4>
      <LineChart points={weightPoints} unit="kg" />

      {open ? (
        <form action={formAction} className={styles.addClientForm} style={{ marginTop: 14 }}>
          <input type="hidden" name="client_id" value={clientId} />
          <div className={styles.addClientFieldsRow}>
            <input type="date" name="measured_on" defaultValue={today} max={today} disabled={pending} className={styles.addClientInputSm} />
            <input
              name="weight_kg"
              type="number"
              inputMode="decimal"
              step="0.1"
              placeholder="Váha (kg)"
              disabled={pending}
              className={styles.addClientInputSm}
            />
          </div>

          {!showMeasurements ? (
            <button type="button" className={styles.measurementsToggle} onClick={() => setShowMeasurements(true)}>
              + Aj obvody (pás, hrudník, boky, paža, stehno)
            </button>
          ) : (
            <div className={styles.addClientFieldsRow}>
              <input name="waist_cm" type="number" inputMode="decimal" step="0.1" placeholder="Pás (cm)" disabled={pending} className={styles.addClientInputSm} />
              <input name="chest_cm" type="number" inputMode="decimal" step="0.1" placeholder="Hrudník (cm)" disabled={pending} className={styles.addClientInputSm} />
              <input name="hips_cm" type="number" inputMode="decimal" step="0.1" placeholder="Boky (cm)" disabled={pending} className={styles.addClientInputSm} />
              <input name="arm_cm" type="number" inputMode="decimal" step="0.1" placeholder="Paža (cm)" disabled={pending} className={styles.addClientInputSm} />
              <input name="thigh_cm" type="number" inputMode="decimal" step="0.1" placeholder="Stehno (cm)" disabled={pending} className={styles.addClientInputSm} />
            </div>
          )}

          <div className={styles.addClientFields}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
              {pending ? "Ukladám…" : "Uložiť meranie"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={pending}>
              Zrušiť
            </button>
          </div>
          {state.error && <p className={styles.addClientError}>{state.error}</p>}
        </form>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 14 }} onClick={() => setOpen(true)}>
          + Nové meranie
        </button>
      )}
    </div>
  );
}
