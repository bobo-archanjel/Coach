"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { deleteMealPlanAction, publishMealPlanAction, type ActionState } from "../actions";
import { saveMealTemplateAction } from "../../../sablony/actions";
import dashboardModule from "../../../dashboard.module.css";
import { useSkinStyles } from "@/app/components/uiSkin";

const initialState: ActionState = { error: null };

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/*
 * Ovládanie jedálnička (0044) rozložené rovnako ako tréningový plán: stav vpravo pri
 * názve (MealPublishBadge), pod názvom súmerná mriežka Zverejniť | Zmazať koncept
 * (MealPublishActions), menej časté akcie dole za čiarou (MealPlanFooterActions).
 * Zverejnenie je jednosmerné. Na rozdiel od tréningového plánu sa dá zmazať aj
 * zverejnený jedálniček (nevisí na ňom história) — potvrdenie hovorí, čo sa stane
 * u klienta.
 */

export function MealPublishBadge({ published, visibleToClient }: { published: boolean; visibleToClient: boolean }) {
  const styles = useSkinStyles("dashboard", dashboardModule);
  return (
    <span className={`${styles.publishBadge} ${published ? styles.publishBadgeLive : styles.publishBadgeDraft}`}>
      {!published
        ? "Koncept — klient ho ešte nevidí"
        : visibleToClient
          ? "Zverejnený — klient ho vidí"
          : "Zverejnený — klient vidí novší jedálniček"}
    </span>
  );
}

function useDeleteMealPlan(planId: string) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!confirming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) setConfirming(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming, pending]);

  const doDelete = () => {
    setError(null);
    startTransition(async () => {
      const res = await deleteMealPlanAction(planId);
      // Úspech → redirect vnútri akcie. Sem sa dostaneme len pri chybe.
      if (res?.error) setError(res.error);
    });
  };

  return { confirming, setConfirming, error, pending, doDelete };
}

/**
 * "Zverejniť" | "Zmazať koncept" — len kým je jedálniček koncept. S neuloženými
 * zmenami v builderi (`dirty`) zverejní až po ich uložení („Uložiť a zverejniť").
 */
export function MealPublishActions({
  planId,
  published,
  dirty = false,
  saveFirst,
}: {
  planId: string;
  published: boolean;
  dirty?: boolean;
  saveFirst?: () => Promise<boolean>;
}) {
  const styles = useSkinStyles("dashboard", dashboardModule);
  const [state, formAction, pending] = useActionState(publishMealPlanAction, initialState);
  const [, startPublish] = useTransition();
  const publish = async () => {
    if (dirty && saveFirst && !(await saveFirst())) return;
    const fd = new FormData();
    fd.set("plan_id", planId);
    startPublish(() => formAction(fd));
  };
  const [justPublished, setJustPublished] = useState(false);
  const del = useDeleteMealPlan(planId);

  useEffect(() => {
    if (state === initialState || state.error) return;
    setJustPublished(true);
    const t = setTimeout(() => setJustPublished(false), 4000);
    return () => clearTimeout(t);
  }, [state]);

  const confirmMsg = justPublished && !state.error && (
    <span className={`${styles.publishConfirm} ${styles.templateStatus}`} role="status">
      <CheckIcon />
      Zverejnené — klient jedálniček už vidí.
    </span>
  );

  if (published) return confirmMsg || null;

  return (
    <div className={styles.templateGrid}>
      {del.confirming ? (
        <>
          <p className={`${styles.publishDeleteConfirm} ${styles.templateStatus}`}>Zmazať tento koncept?</p>
          <button type="button" className="btn btn-primary btn-sm btn-danger" onClick={del.doDelete} disabled={del.pending}>
            {del.pending ? "Mažem…" : "Áno, zmazať"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => del.setConfirming(false)}
            disabled={del.pending}
          >
            Zrušiť
          </button>
        </>
      ) : (
        <>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void publish()} disabled={pending}>
            {/* Krátko — „Potvrdiť a zverejniť" sa v polovičnej šírke na telefóne lámalo. */}
            {pending ? "Zverejňujem…" : dirty ? "Uložiť a zverejniť" : "Zverejniť"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={() => del.setConfirming(true)}>
            Zmazať koncept
          </button>
        </>
      )}
      {confirmMsg}
      {state.error && <p className={`${styles.publishError} ${styles.templateStatus}`}>{state.error}</p>}
      {del.error && <p className={`${styles.publishError} ${styles.templateStatus}`}>{del.error}</p>}
    </div>
  );
}

/**
 * Spodok jedálnička: "Stiahnuť PDF" | "Uložiť ako šablónu" (pod názvom jedálnička —
 * iný názov = premenovať ceruzkou pri nadpise) a pri zverejnenom aj "Zmazať".
 */
export function MealPlanFooterActions({
  planId,
  planName,
  published,
  visibleToClient,
}: {
  planId: string;
  planName: string;
  published: boolean;
  visibleToClient: boolean;
}) {
  const styles = useSkinStyles("dashboard", dashboardModule);
  const [templateState, templateAction, templatePending] = useActionState(saveMealTemplateAction, initialState);
  const [, startTemplate] = useTransition();
  const del = useDeleteMealPlan(planId);

  const saveTemplate = () => {
    const fd = new FormData();
    fd.set("plan_id", planId);
    fd.set("name", planName);
    startTemplate(() => templateAction(fd));
  };

  if (del.confirming) {
    return (
      <div className={styles.templateGrid} role="alertdialog" aria-labelledby="delete-meal-plan-question">
        <p id="delete-meal-plan-question" className={`${styles.publishDeleteConfirm} ${styles.templateStatus}`}>
          Naozaj zmazať jedálniček „{planName}“?
          {visibleToClient
            ? " Klient ho prestane vidieť (ukáže sa mu predošlý zverejnený, ak nejaký je)."
            : ""}{" "}
          Jeho denník jedla ostáva.
        </p>
        <button type="button" className="btn btn-primary btn-sm btn-danger" onClick={del.doDelete} disabled={del.pending}>
          {del.pending ? "Mažem…" : "Áno, zmazať"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => del.setConfirming(false)} disabled={del.pending}>
          Zrušiť
        </button>
        {del.error && <p className={`${styles.publishError} ${styles.templateStatus}`}>{del.error}</p>}
      </div>
    );
  }

  return (
    <div className={styles.templateGrid}>
      <a href={`/api/export/meal-plan/${planId}/pdf`} className="btn btn-ghost btn-sm">
        Stiahnuť PDF
      </a>
      <button type="button" className="btn btn-ghost btn-sm" onClick={saveTemplate} disabled={templatePending}>
        {templatePending ? "Ukladám…" : "Uložiť ako šablónu"}
      </button>
      {published && (
        <button type="button" className={`btn btn-ghost btn-sm btn-danger ${styles.dangerGhost}`} onClick={() => del.setConfirming(true)}>
          Zmazať
        </button>
      )}
      {!templatePending && templateState.error && (
        <span className={`${styles.noWorkouts} ${styles.templateStatus}`}>{templateState.error}</span>
      )}
      {!templatePending && templateState !== initialState && !templateState.error && (
        <span className={`${styles.clientSince} ${styles.templateStatus}`}>
          Uložené — pozri v <Link href="/dashboard/sablony">Šablónach</Link>.
        </span>
      )}
    </div>
  );
}
