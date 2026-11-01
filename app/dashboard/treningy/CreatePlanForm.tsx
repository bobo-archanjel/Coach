"use client";

import { useActionState } from "react";
import { createPlanAction, type ActionState } from "./actions";
import dashboardModule from "../dashboard.module.css";
import { useSkinStyles } from "@/app/components/uiSkin";

const initialState: ActionState = { error: null };

export function CreatePlanForm({ clients }: { clients: { id: string; full_name: string }[] }) {
  const styles = useSkinStyles("dashboard", dashboardModule);
  const [state, formAction, pending] = useActionState(createPlanAction, initialState);

  if (clients.length === 0) {
    return <p className={styles.noWorkouts}>Najprv pridaj klienta na stránke Klienti.</p>;
  }

  return (
    <form action={formAction} className={styles.addClientForm}>
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
        <input
          name="name"
          type="text"
          placeholder="Názov plánu (napr. Silový 4-týždňový)"
          required
          disabled={pending}
          className={styles.addClientInput}
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? "Vytváram…" : "Vytvoriť plán"}
        </button>
      </div>
      {state.error && <p className={styles.addClientError}>{state.error}</p>}
    </form>
  );
}
