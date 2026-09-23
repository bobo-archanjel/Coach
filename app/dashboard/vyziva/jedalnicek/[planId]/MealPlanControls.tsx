"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  deleteMealPlanAction,
  publishMealPlanAction,
  renameMealPlanAction,
  type ActionState,
} from "../actions";
import styles from "../../../dashboard.module.css";
import builderStyles from "./builder.module.css";

const initialState: ActionState = { error: null };

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Stav jedálnička (0044) + premenovanie a zmazanie. Rovnaký vzor ako tréningový
 * PublishControl: koncept klient nevidí, zverejnenie je jednosmerné. Na rozdiel
 * od tréningového plánu sa dá zmazať aj zverejnený jedálniček (nevisí na ňom
 * história), preto potvrdenie hovorí, čo presne sa stane u klienta.
 */
export function MealPlanControls({
  planId,
  name,
  published,
  visibleToClient,
}: {
  planId: string;
  name: string;
  published: boolean;
  /** true = je to najnovší zverejnený jedálniček, ktorý klient práve vidí v Strave */
  visibleToClient: boolean;
}) {
  const [publishState, publishAction, publishPending] = useActionState(publishMealPlanAction, initialState);
  const [renameState, renameAction, renamePending] = useActionState(renameMealPlanAction, initialState);
  const [justPublished, setJustPublished] = useState(false);
  const [renaming, setRenaming] = useState(false);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, startDelete] = useTransition();

  useEffect(() => {
    if (publishState === initialState || publishState.error) return;
    setJustPublished(true);
    const t = setTimeout(() => setJustPublished(false), 4000);
    return () => clearTimeout(t);
  }, [publishState]);

  useEffect(() => {
    if (renameState !== initialState && !renameState.error) setRenaming(false);
  }, [renameState]);

  const doDelete = () => {
    setDeleteError(null);
    startDelete(async () => {
      const res = await deleteMealPlanAction(planId);
      // Úspech → redirect vnútri akcie. Sem sa dostaneme len pri chybe.
      if (res?.error) setDeleteError(res.error);
    });
  };

  const deleteWarning = !published
    ? "Zmazať tento koncept?"
    : visibleToClient
      ? "Zmazať jedálniček? Klient ho prestane vidieť (ukáže sa mu predošlý zverejnený, ak nejaký je). Jeho denník jedla ostáva."
      : "Zmazať jedálniček? Jeho denník jedla ostáva.";

  return (
    <div className={styles.publishBox}>
      <span className={`${styles.publishBadge} ${published ? styles.publishBadgeLive : styles.publishBadgeDraft}`}>
        {!published
          ? "Koncept — klient ho ešte nevidí"
          : visibleToClient
            ? "Zverejnený — klient ho vidí"
            : "Zverejnený — klient vidí novší jedálniček"}
      </span>

      {!published && (
        <form action={publishAction}>
          <input type="hidden" name="plan_id" value={planId} />
          <button type="submit" className="btn btn-primary btn-sm" disabled={publishPending}>
            {publishPending ? "Ukladám…" : "Potvrdiť a zverejniť"}
          </button>
        </form>
      )}

      {renaming ? (
        <form action={renameAction} className={styles.publishDeleteConfirm}>
          <input type="hidden" name="plan_id" value={planId} />
          <input
            name="name"
            defaultValue={name}
            aria-label="Názov jedálnička"
            className={builderStyles.addDayInput}
            autoFocus
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={renamePending}>
            {renamePending ? "Ukladám…" : "Uložiť"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenaming(false)} disabled={renamePending}>
            Zrušiť
          </button>
        </form>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenaming(true)}>
          Premenovať
        </button>
      )}

      {confirmingDelete ? (
        <span className={styles.publishDeleteConfirm}>
          <span>{deleteWarning}</span>
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
          {published ? "Zmazať jedálniček" : "Zmazať koncept"}
        </button>
      )}

      {justPublished && !publishState.error && (
        <span className={styles.publishConfirm} role="status">
          <CheckIcon />
          Zverejnené — klient jedálniček už vidí.
        </span>
      )}
      {publishState.error && <p className={styles.publishError}>{publishState.error}</p>}
      {renameState.error && <p className={styles.publishError}>{renameState.error}</p>}
      {deleteError && <p className={styles.publishError}>{deleteError}</p>}
    </div>
  );
}
