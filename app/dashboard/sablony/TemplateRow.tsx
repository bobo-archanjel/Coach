"use client";

import { useActionState, useState, useTransition } from "react";
import {
  applyWorkoutTemplateAction,
  applyMealTemplateAction,
  deleteWorkoutTemplateAction,
  deleteMealTemplateAction,
  type ActionState,
} from "./actions";
import styles from "../dashboard.module.css";

const initialState: ActionState = { error: null };

/**
 * Jeden riadok šablóny (tréningová aj jedálničková, `kind` rozlišuje akciu).
 * "Zmazať" vyžaduje potvrdenie druhým klikom — šablóna sa mazaním neruší,
 * na rozdiel od plánu klienta, ale stále ide o nezvratnú akciu.
 */
export function TemplateRow({
  kind,
  templateId,
  name,
  dayCount,
  clients,
}: {
  kind: "workout" | "meal";
  templateId: string;
  name: string;
  dayCount: number;
  clients: { id: string; full_name: string }[];
}) {
  const applyAction = kind === "workout" ? applyWorkoutTemplateAction : applyMealTemplateAction;
  const [state, formAction, applyPending] = useActionState(applyAction, initialState);
  const [deletePending, startDelete] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function handleDelete() {
    startDelete(async () => {
      if (kind === "workout") await deleteWorkoutTemplateAction(templateId);
      else await deleteMealTemplateAction(templateId);
    });
  }

  return (
    <div className={styles.templateCard}>
      <div className={styles.templateHead}>
        <div>
          <div className={styles.clientName}>{name}</div>
          <span className={styles.clientSince}>{dayCount} dní</span>
        </div>
        <div className={styles.templateHeadActions}>
          {confirmingDelete ? (
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={handleDelete} disabled={deletePending}>
                {deletePending ? "Mažem…" : "Naozaj zmazať"}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmingDelete(false)} disabled={deletePending}>
                Zrušiť
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmingDelete(true)}>
              Zmazať
            </button>
          )}
        </div>
      </div>

      {clients.length > 0 ? (
        <form action={formAction} className={styles.templateApplyForm}>
          <input type="hidden" name="template_id" value={templateId} />
          <select name="client_id" required disabled={applyPending} className={styles.addClientInput} defaultValue="">
            <option value="" disabled>
              Vyber klienta
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-primary btn-sm" disabled={applyPending}>
            {applyPending ? "Vytváram…" : "Použiť pre klienta"}
          </button>
        </form>
      ) : (
        <p className={styles.noWorkouts}>Najprv pridaj klienta na stránke Klienti.</p>
      )}

      {state.error && <p className={styles.noWorkouts}>{state.error}</p>}
    </div>
  );
}
