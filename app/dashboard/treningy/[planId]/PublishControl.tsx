"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { setPlanPublishedAction, deletePlanAction, type ActionState } from "../actions";
import styles from "../../dashboard.module.css";

const initialState: ActionState = { error: null };

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Potvrdenie plánu — kým je koncept, klient ho v portáli nevidí (viď actions.ts). */
export function PublishControl({ planId, published }: { planId: string; published: boolean }) {
  const [state, formAction, pending] = useActionState(setPlanPublishedAction, initialState);
  // Odznak hore sa mení trvalo (podľa `published` z DB), ale samotná zmena je
  // ľahko prehliadnuteľná — táto správa na pár sekúnd jasne potvrdí, že klik
  // niečo reálne uložil (nie len že sa nič nestalo).
  const [justSaved, setJustSaved] = useState(false);

  // Zmazanie konceptu — dvojkrokové inline potvrdenie (rovnaký vzor ako DangerZone).
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, startDelete] = useTransition();

  useEffect(() => {
    if (state === initialState || state.error) return;
    setJustSaved(true);
    const t = setTimeout(() => setJustSaved(false), 4000);
    return () => clearTimeout(t);
  }, [state]);

  const doDelete = () => {
    setDeleteError(null);
    startDelete(async () => {
      const res = await deletePlanAction(planId);
      // Úspech → redirect vnútri akcie (sem sa už nevrátime). Sem sa dostaneme len pri chybe.
      if (res?.error) setDeleteError(res.error);
    });
  };

  return (
    <div className={styles.publishBox}>
      <span className={`${styles.publishBadge} ${published ? styles.publishBadgeLive : styles.publishBadgeDraft}`}>
        {published ? "Publikovaný — klient ho vidí" : "Koncept — klient ho ešte nevidí"}
      </span>
      <form action={formAction}>
        <input type="hidden" name="plan_id" value={planId} />
        <input type="hidden" name="published" value={published ? "false" : "true"} />
        <button type="submit" className={published ? "btn btn-ghost btn-sm" : "btn btn-primary btn-sm"} disabled={pending}>
          {pending ? "Ukladám…" : published ? "Vytvoriť" : "Potvrdiť a uložiť"}
        </button>
      </form>

      {!published &&
        (confirmingDelete ? (
          <span className={styles.publishDeleteConfirm}>
            <span>Zmazať tento koncept?</span>
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
          </span>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmingDelete(true)}>
            Zmazať koncept
          </button>
        ))}

      {justSaved && !state.error && (
        <span className={styles.publishConfirm} role="status">
          <CheckIcon />
          {published ? "Uložené — klient tréning už vidí." : "Uložené ako koncept."}
        </span>
      )}
      {state.error && <p className={styles.publishError}>{state.error}</p>}
      {deleteError && <p className={styles.publishError}>{deleteError}</p>}
    </div>
  );
}
