"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState, type FormEvent } from "react";
import { createMealPlanAction, type ActionState } from "./jedalnicek/actions";
import { ClientMultiSelect } from "../ClientMultiSelect";
import styles from "../dashboard.module.css";

const initialState: ActionState = { error: null };

/**
 * „Nový jedálniček“ na /dashboard/jedalnicky (rovnako ako Nový plán v Tréningoch) — pre
 * jedného alebo viacerých klientov. Pri viacerých vznikne JEDEN koncept (pre prvého
 * vybraného) a ostatní sú jeho príjemcovia („Pošle sa aj:“ v builderi, 0052) — po
 * odoslaní dostane každý vlastnú kópiu, ktorú potom tréner upravuje nezávisle.
 */
export function CreateMealPlanForm({ clients }: { clients: { id: string; full_name: string }[] }) {
  const t = useTranslations("mealPlans.create");
  const [state, formAction, pending] = useActionState(createMealPlanAction, initialState);
  const [selected, setSelected] = useState<string[]>(() => (clients.length === 1 ? [clients[0].id] : []));
  const [missingClient, setMissingClient] = useState(false);

  if (clients.length === 0) {
    return <p className={styles.noWorkouts}>{t("noClients")}</p>;
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    if (selected.length > 0) return;
    e.preventDefault();
    setMissingClient(true);
  }

  const count = selected.length;
  return (
    <form action={formAction} onSubmit={onSubmit} className={styles.addClientForm} aria-label={t("formLabel")}>
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
          placeholder={t("namePlaceholder")}
          required
          disabled={pending}
          className={styles.addClientInput}
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending
            ? t("creating")
            : count > 1
              ? t("createFor", { count })
              : t("create")}
        </button>
      </div>
      {count > 1 && (
        <p className={styles.formHint}>{t("multiHint")}</p>
      )}
      {missingClient && <p className={styles.addClientError}>{t("chooseClient")}</p>}
      {state.error && <p className={styles.addClientError}>{state.error}</p>}
    </form>
  );
}
