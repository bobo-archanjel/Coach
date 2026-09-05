"use client";

import { useActionState, useEffect, useState } from "react";
import { addOwnBodyMetricAction } from "./actions";
import styles from "./portal.module.css";

interface ActionState {
  error: string | null;
}
const initialState: ActionState = { error: null };

/**
 * Progres — klient si sám zapíše meranie (váha + voliteľne obvody) priamo na
 * karte Dnes. Predtým to zapisoval tréner v dashboarde (feature/progress-analyst) —
 * presunuté po revízii 2026-09: klient má váhu pri sebe, tréner ju v Analytike
 * len sleduje. RLS/akcia: `addOwnBodyMetricAction` (0024_body_metrics_client_write.sql).
 */
export function BodyMetricForm({ today }: { today: string }) {
  const [state, formAction, pending] = useActionState(addOwnBodyMetricAction, initialState);
  const [open, setOpen] = useState(false);
  const [showMeasurements, setShowMeasurements] = useState(false);

  // Zavrieť len po úspešnom uložení — pri okamžitom zatvorení pri submite by
  // prípadná chybová hláška zmizla skôr, než ju klient stihne prečítať.
  useEffect(() => {
    if (state === initialState || state.error) return;
    setOpen(false);
    setShowMeasurements(false);
  }, [state]);

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" style={{ width: "100%", justifyContent: "center" }} onClick={() => setOpen(true)}>
        + Zapísať meranie
      </button>
    );
  }

  return (
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
  );
}
