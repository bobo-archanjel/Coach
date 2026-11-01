"use client";

import { useActionState, useState, type FormEvent } from "react";
import { createPlanAction, type ActionState } from "./actions";
import { ClientMultiSelect } from "../ClientMultiSelect";
import { pluralSk } from "@/lib/portal/streak";
import dashboardModule from "../dashboard.module.css";
import { useSkinStyles } from "@/app/components/uiSkin";

const initialState: ActionState = { error: null };

/**
 * Nový plán pre jedného alebo viacerých klientov. Pri viacerých vznikne JEDEN koncept
 * (pre prvého vybraného) a ostatní sú jeho príjemcovia („Pošle sa aj:“ v builderi, 0052) —
 * po odoslaní dostane každý vlastnú kópiu, ktorú potom tréner upravuje nezávisle.
 */
export function CreatePlanForm({ clients }: { clients: { id: string; full_name: string }[] }) {
  const styles = useSkinStyles("dashboard", dashboardModule);
  const [state, formAction, pending] = useActionState(createPlanAction, initialState);
  const [selected, setSelected] = useState<string[]>(() => (clients.length === 1 ? [clients[0].id] : []));
  const [missingClient, setMissingClient] = useState(false);

  if (clients.length === 0) {
    return <p className={styles.noWorkouts}>Najprv pridaj klienta na stránke Klienti.</p>;
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    if (selected.length > 0) return;
    e.preventDefault();
    setMissingClient(true);
  }

  const count = selected.length;
  return (
    <form action={formAction} onSubmit={onSubmit} className={styles.addClientForm} aria-label="Nový plán">
      <ClientMultiSelect
        clients={clients}
        selected={selected}
        onChange={(ids) => {
          setSelected(ids);
          if (ids.length > 0) setMissingClient(false);
        }}
        disabled={pending}
        invalid={missingClient}
      />
      <div className={styles.addClientFields}>
        <input
          name="name"
          type="text"
          placeholder="Názov plánu (napr. Silový 4-týždňový)"
          required
          disabled={pending}
          className={styles.addClientInput}
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending
            ? "Vytváram…"
            : count > 1
              ? `Vytvoriť plán pre ${count} ${pluralSk(count, "klienta", "klientov", "klientov")}`
              : "Vytvoriť plán"}
        </button>
      </div>
      {count > 1 && (
        <p className={styles.formHint}>Otvorí sa jeden koncept — po odoslaní dostane každý klient vlastnú kópiu plánu.</p>
      )}
      {missingClient && <p className={styles.addClientError}>Vyber aspoň jedného klienta.</p>}
      {state.error && <p className={styles.addClientError}>{state.error}</p>}
    </form>
  );
}
