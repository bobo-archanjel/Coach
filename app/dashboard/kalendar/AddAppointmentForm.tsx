"use client";

import { useActionState, useRef, useEffect } from "react";
import { createAppointmentAction, type ActionState } from "./actions";
import styles from "../dashboard.module.css";

const initialState: ActionState = { error: null };

export function AddAppointmentForm({ clients }: { clients: { id: string; full_name: string }[] }) {
  const [state, formAction, pending] = useActionState(createAppointmentAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  // Po úspešnom uložení vyčisti formulár (žiadny explicitný "úspech" text netreba —
  // nový termín sa hneď objaví v agende nižšie vďaka revalidatePath).
  useEffect(() => {
    if (wasPending.current && !pending && !state.error) formRef.current?.reset();
    wasPending.current = pending;
  }, [pending, state.error]);

  if (clients.length === 0) {
    return <p className={styles.noWorkouts}>Najprv pridaj klienta na stránke Klienti.</p>;
  }

  return (
    <form ref={formRef} action={formAction} className={styles.addClientForm}>
      <div className={styles.addClientFields}>
        <select name="client_id" required disabled={pending} className={styles.addClientInput} defaultValue="">
          <option value="" disabled>
            Vyber klienta
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
            </option>
          ))}
        </select>
        <input name="title" type="text" placeholder="Napr. Konzultácia" required maxLength={200} disabled={pending} className={styles.addClientInput} />
      </div>
      <div className={styles.addClientFieldsRow}>
        <input name="date" type="date" required disabled={pending} className={styles.addClientInputSm} />
        <input name="time" type="time" required disabled={pending} className={styles.addClientInputSm} />
        <input name="end_time" type="time" disabled={pending} className={styles.addClientInputSm} title="Voliteľný koniec termínu" />
      </div>
      <div className={styles.addClientFields}>
        <input name="note" type="text" placeholder="Poznámka (voliteľné)" maxLength={1000} disabled={pending} className={styles.addClientInput} />
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? "Ukladám…" : "Pridať termín"}
        </button>
      </div>
      {state.error && <p className={styles.noWorkouts}>{state.error}</p>}
    </form>
  );
}
