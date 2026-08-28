"use client";

import { useActionState } from "react";
import { createMealPlanAction, type ActionState } from "../jedalnicek/actions";
import styles from "../../dashboard.module.css";

const initialState: ActionState = { error: null };

export function CreateMealPlanForm({ clientId }: { clientId: string }) {
  const [state, formAction, pending] = useActionState(createMealPlanAction, initialState);

  return (
    <form action={formAction} className={styles.addClientForm}>
      <input type="hidden" name="client_id" value={clientId} readOnly />
      <div className={styles.addClientFields}>
        <input
          name="name"
          type="text"
          placeholder="Názov jedálničku (napr. Nabieranie — jeseň)"
          required
          disabled={pending}
          className={styles.addClientInput}
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? "Vytváram…" : "Vytvoriť jedálniček"}
        </button>
      </div>
      {state.error && <p className={styles.addClientError}>{state.error}</p>}
    </form>
  );
}
