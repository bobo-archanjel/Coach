"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addClientAction, type AddClientState } from "./actions";
import styles from "./dashboard.module.css";

const initialState: AddClientState = { error: null };

/**
 * Formulár je skrytý za tlačidlom "+ Nový klient" — otvorené a zavreté cez
 * lokálny `open`, žiadny reset ref treba: zatvorenie odmontuje `<form>` a
 * ďalšie otvorenie ho namontuje prázdny nanovo (rovnaký toggle vzor ako
 * "+ Zapísať meranie" v app/portal/BodyMetricForm.tsx).
 */
export function AddClientForm() {
  const [state, formAction, pending] = useActionState(addClientAction, initialState);
  const [open, setOpen] = useState(false);
  const prevPending = useRef(false);

  useEffect(() => {
    // Zavrieť len po úspešnom uložení — pri okamžitom zatvorení pri submite by
    // prípadná chybová hláška zmizla skôr, než ju tréner stihne prečítať.
    if (prevPending.current && !pending && !state.error) setOpen(false);
    prevPending.current = pending;
  }, [pending, state.error]);

  return (
    <div className={styles.addClientForm}>
      {open ? (
        <form action={formAction}>
          <div className={styles.addClientFields}>
            <input
              name="full_name"
              type="text"
              placeholder="Meno a priezvisko"
              required
              disabled={pending}
              className={styles.addClientInput}
            />
            <input
              name="goal"
              type="text"
              placeholder="Cieľ (napr. chudnutie)"
              disabled={pending}
              className={styles.addClientInput}
            />
          </div>
          <div className={styles.addClientFieldsRow}>
            <input
              name="age"
              type="number"
              inputMode="numeric"
              placeholder="Vek"
              min={1}
              max={119}
              disabled={pending}
              className={styles.addClientInputSm}
            />
            <input
              name="weight_kg"
              type="number"
              inputMode="decimal"
              placeholder="Váha (kg)"
              min={1}
              step="0.1"
              disabled={pending}
              className={styles.addClientInputSm}
            />
            <input
              name="height_cm"
              type="number"
              inputMode="decimal"
              placeholder="Výška (cm)"
              min={1}
              step="0.1"
              disabled={pending}
              className={styles.addClientInputSm}
            />
          </div>
          <div className={styles.addClientFields}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
              {pending ? "Pridávam…" : "Pridať klienta"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={pending}>
              Zrušiť
            </button>
          </div>
          {state.error && <p className={styles.addClientError}>{state.error}</p>}
        </form>
      ) : (
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
          + Nový klient
        </button>
      )}
    </div>
  );
}
