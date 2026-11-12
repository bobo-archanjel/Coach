"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
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
  const t = useTranslations("plans.builder");
  return (
    <span className={`${styles.publishBadge} ${published ? styles.publishBadgeLive : styles.publishBadgeDraft}`}>
      {published ? t("published") : t("draftBadge")}
    </span>
  );
}

/**
 * "Potvrdiť a uložiť" + "Zmazať koncept" — v rovnakej 2-stĺpcovej mriežke ako
 * riadok šablóny pod ním (templateGrid), aby boli tlačidlá na stránke plánu
 * súmerné. Publikovanie je jednosmerné: po ňom obe akcie zmiznú.
 */
export function PublishActions({
  planId,
  published,
  recipientCount = 0,
}: {
  planId: string;
  published: boolean;
  /** ďalší príjemcovia konceptu (šablóna pre viacerých klientov, 0052) */
  recipientCount?: number;
}) {
  const t = useTranslations("plans.builder");
  const [state, formAction, pending] = useActionState(setPlanPublishedAction, initialState);
  // Stav pri názve sa mení trvalo (podľa `published` z DB), ale samotná zmena je
  // ľahko prehliadnuteľná — táto správa na pár sekúnd jasne potvrdí, že klik
  // niečo reálne uložil (nie len že sa nič nestalo).
  const [justSaved, setJustSaved] = useState(false);
  // koľkým klientom sa posielalo — po odoslaní príjemcovia z DB zmiznú (prop je potom 0)
  const sentTo = useRef(1);

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
      {sentTo.current > 1 ? t("sentToMany", { count: sentTo.current }) : t("savedVisible")}
    </span>
  );

  if (published) return confirmMsg || null;

  return (
    <div className={styles.templateGrid}>
      {confirmingDelete ? (
        <>
          <p className={`${styles.publishDeleteConfirm} ${styles.templateStatus}`}>{t("deleteDraftConfirm")}</p>
          <button type="button" className="btn btn-primary btn-sm btn-danger" onClick={doDelete} disabled={deletePending}>
            {deletePending ? t("deleting") : t("yesDelete")}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setConfirmingDelete(false)}
            disabled={deletePending}
          >
            {t("cancel")}
          </button>
        </>
      ) : (
        <>
          <form action={formAction} onSubmit={() => (sentTo.current = 1 + recipientCount)}>
            <input type="hidden" name="plan_id" value={planId} />
            <input type="hidden" name="published" value="true" />
            <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
              {pending ? t("sending") : recipientCount > 0 ? t("sendTo", { count: recipientCount + 1 }) : t("confirmSave")}
            </button>
          </form>
          <button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={() => setConfirmingDelete(true)}>
            {t("deleteDraft")}
          </button>
        </>
      )}
      {confirmMsg}
      {state.error && <p className={`${styles.publishError} ${styles.templateStatus}`}>{state.error}</p>}
      {deleteError && <p className={`${styles.publishError} ${styles.templateStatus}`}>{deleteError}</p>}
    </div>
  );
}
