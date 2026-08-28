"use client";

import { useActionState, useRef, useEffect } from "react";
import { addClientAction, type AddClientState } from "./actions";
import styles from "./dashboard.module.css";

const initialState: AddClientState = { error: null };

export function AddClientForm() {
  const [state, formAction, pending] = useActionState(addClientAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const prevPending = useRef(false);

  useEffect(() => {
    // Formulár vyčistiť po úspešnom odoslaní (pending: true -> false, žiadna chyba).
    if (prevPending.current && !pending && !state.error) {
      formRef.current?.reset();
    }
    prevPending.current = pending;
  }, [pending, state.error]);

  return (
    <form ref={formRef} action={formAction} className={styles.addClientForm}>
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
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? "Pridávam…" : "Pridať klienta"}
        </button>
      </div>
      {state.error && <p className={styles.addClientError}>{state.error}</p>}
    </form>
  );
}
