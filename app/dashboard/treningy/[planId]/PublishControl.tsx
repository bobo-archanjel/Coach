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

/** Stav plánu pri názve — kým je koncept, klient ho v portáli nevidí (viď actions.ts). */
export function PublishBadge({ published }: { published: boolean }) {
  return (
    <span className={`${styles.publishBadge} ${published ? styles.publishBadgeLive : styles.publishBadgeDraft}`}>
      {published ? "Publikovaný — klient ho vidí" : "Koncept — klient ho ešte nevidí"}
    </span>
  );
}

/**
 * "Potvrdiť a uložiť" + "Zmazať koncept" — v rovnakej 2-stĺpcovej mriežke ako
 * riadok šablóny pod ním (templateGrid), aby boli tlačidlá na stránke plánu
 * súmerné. Publikovanie je jednosmerné: po ňom obe akcie zmiznú.
 */
export function PublishActions({ planId, published }: { planId: string; published: boolean }) {
  const [state, formAction, pending] = useActionState(setPlanPublishedAction, initialState);
  // Stav pri názve sa mení trvalo (podľa `published` z DB), ale samotná zmena je
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

  const confirmMsg = justSaved && !state.error && (
    <span className={`${styles.publishConfirm} ${styles.templateStatus}`} role="status">
      <CheckIcon />
      Uložené — klient tréning už vidí.
    </span>
  );

  if (published) return confirmMsg || null;

  return (
    <div className={styles.templateGrid}>
      {confirmingDelete ? (
        <>
          <p className={`${styles.publishDeleteConfirm} ${styles.templateStatus}`}>Zmazať tento koncept?</p>
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
        </>
      ) : (
        <>
          <form action={formAction}>
            <input type="hidden" name="plan_id" value={planId} />
            <input type="hidden" name="published" value="true" />
            <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
              {pending ? "Ukladám…" : "Potvrdiť a uložiť"}
            </button>
          </form>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmingDelete(true)}>
            Zmazať koncept
          </button>
        </>
      )}
      {confirmMsg}
      {state.error && <p className={`${styles.publishError} ${styles.templateStatus}`}>{state.error}</p>}
      {deleteError && <p className={`${styles.publishError} ${styles.templateStatus}`}>{deleteError}</p>}
    </div>
  );
}
