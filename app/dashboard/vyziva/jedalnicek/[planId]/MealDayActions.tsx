"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { deleteMealDayAction, renameMealDayAction, type ActionState } from "../actions";
import styles from "./builder.module.css";

const initialState: ActionState = { error: null };

/** Premenovanie / zmazanie aktívneho dňa jedálnička (zmazanie s inline potvrdením). */
export function MealDayActions({ planId, dayId, name }: { planId: string; dayId: string; name: string }) {
  const [renameState, renameAction, renamePending] = useActionState(renameMealDayAction, initialState);
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, startDelete] = useTransition();

  useEffect(() => {
    if (renameState !== initialState && !renameState.error) setRenaming(false);
  }, [renameState]);

  const doDelete = () => {
    setDeleteError(null);
    startDelete(async () => {
      const res = await deleteMealDayAction(dayId, planId);
      if (res.error) setDeleteError(res.error);
      else setConfirmingDelete(false);
    });
  };

  if (renaming) {
    return (
      <form action={renameAction} className={styles.addDayForm}>
        <input type="hidden" name="plan_id" value={planId} />
        <input type="hidden" name="day_id" value={dayId} />
        <input name="name" defaultValue={name} aria-label="Názov dňa" className={styles.addDayInput} autoFocus />
        <button type="submit" className="btn btn-primary btn-sm" disabled={renamePending}>
          {renamePending ? "…" : "Uložiť"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenaming(false)} disabled={renamePending}>
          Zrušiť
        </button>
        {renameState.error && <p className={styles.formError}>{renameState.error}</p>}
      </form>
    );
  }

  if (confirmingDelete) {
    return (
      <div className={styles.addDayForm}>
        <span className={styles.emptyDay}>Zmazať deň „{name}“ aj s jeho potravinami?</span>
        <button type="button" className="btn btn-primary btn-sm" onClick={doDelete} disabled={deletePending}>
          {deletePending ? "Mažem…" : "Áno, zmazať"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setConfirmingDelete(false)}
          disabled={deletePending}
        >
          Zrušiť
        </button>
        {deleteError && <p className={styles.formError}>{deleteError}</p>}
      </div>
    );
  }

  return (
    <div className={styles.addDayForm}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenaming(true)}>
        Premenovať deň
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmingDelete(true)}>
        Zmazať deň
      </button>
    </div>
  );
}
