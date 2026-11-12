"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { addCustomExerciseAction, type ActionState } from "./actions";
import styles from "../dashboard.module.css";

const initialState: ActionState = { error: null };

export function AddCustomExerciseForm() {
  const [state, formAction, pending] = useActionState(addCustomExerciseAction, initialState);
  const t = useTranslations("plans.customExercise");

  return (
    <form action={formAction} className={styles.addClientForm}>
      <div className={styles.addClientFields}>
        <input
          name="name"
          type="text"
          placeholder={t("name")}
          required
          disabled={pending}
          className={styles.addClientInput}
        />
        <input
          name="muscle_group"
          type="text"
          placeholder={t("muscle")}
          disabled={pending}
          className={styles.addClientInput}
        />
        <button type="submit" className="btn btn-ghost btn-sm" disabled={pending}>
          {pending ? t("adding") : t("add")}
        </button>
      </div>
      {state.error && <p className={styles.addClientError}>{state.error}</p>}
    </form>
  );
}
