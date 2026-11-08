"use client";

import { useActionState } from "react";
import { createMealPlanAction, type ActionState } from "@/app/dashboard/jedalnicky/jedalnicek/actions";
import styles from "../../dashboard.module.css";

const initialState: ActionState = { error: null };

/**
 * Prázdny stav sekcie Jedálničky v detaile klienta — jedným klikom koncept s predvoleným
 * názvom a rovno builder (názov sa dá zmeniť ceruzkou v builderi).
 */
export function CreateMealPlanButton({ clientId, defaultName }: { clientId: string; defaultName: string }) {
  const [state, formAction, pending] = useActionState(createMealPlanAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="client_id" value={clientId} readOnly />
      <input type="hidden" name="name" value={defaultName} readOnly />
      <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
        {pending ? "Vytváram…" : "Vytvoriť jedálniček"}
      </button>
      {state.error && <p className={styles.addClientError}>{state.error}</p>}
    </form>
  );
}
