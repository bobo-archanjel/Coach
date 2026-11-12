"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { deleteMealPlanAction, publishMealPlanAction, type ActionState } from "../actions";
import { saveMealTemplateAction } from "../../../sablony/actions";
import styles from "../../../dashboard.module.css";

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
  const t = useTranslations("mealPlans.controls");
  return (
    <span className={`${styles.publishBadge} ${published ? styles.publishBadgeLive : styles.publishBadgeDraft}`}>
      {!published ? t("draftBadge") : visibleToClient ? t("publishedVisible") : t("publishedNewer")}
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
 * "Poslať klientovi" (= zverejniť) | "Zmazať koncept" — len kým je jedálniček koncept.
 * S neuloženými zmenami v builderi (`dirty`) ho pošle až po ich uložení („Uložiť a poslať") —
 * koncept nemá spodnú lištu „Uložiť zmeny", ukladá sa len týmto tlačidlom.
 */
export function MealPublishActions({
  planId,
  published,
  dirty = false,
  saveFirst,
  saving = false,
  saveError = null,
  recipientCount = 0,
}: {
  planId: string;
  published: boolean;
  dirty?: boolean;
  saveFirst?: () => Promise<boolean>;
  /** builder práve ukladá zmeny pred odoslaním */
  saving?: boolean;
  /** chyba uloženia zmien z buildera (koncept nemá spodnú lištu, kde by sa ukázala) */
  saveError?: string | null;
  /** ďalší príjemcovia konceptu (šablóna pre viacerých klientov, 0052) */
  recipientCount?: number;
}) {
  const t = useTranslations("mealPlans.controls");
  const [state, formAction, pending] = useActionState(publishMealPlanAction, initialState);
  const [, startPublish] = useTransition();
  // koľkým klientom sa posielalo — po odoslaní príjemcovia z DB zmiznú (prop je potom 0)
  const sentTo = useRef(1);
  const publish = async () => {
    if (dirty && saveFirst && !(await saveFirst())) return;
    sentTo.current = 1 + recipientCount;
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
      {sentTo.current > 1 ? t("sentToMany", { count: sentTo.current }) : t("sentOne")}
    </span>
  );

  if (published) return confirmMsg || null;

  return (
    <div className={styles.templateGrid}>
      {del.confirming ? (
        <>
          <p className={`${styles.publishDeleteConfirm} ${styles.templateStatus}`}>{t("deleteDraftConfirm")}</p>
          <button type="button" className="btn btn-primary btn-sm btn-danger" onClick={del.doDelete} disabled={del.pending}>
            {del.pending ? t("deleting") : t("yesDelete")}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => del.setConfirming(false)}
            disabled={del.pending}
          >
            {t("cancel")}
          </button>
        </>
      ) : (
        <>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void publish()} disabled={pending || saving}>
            {/* Krátko — dlhý text sa v polovičnej šírke na telefóne lámal („Uložiť a poslať"). */}
            {saving
              ? t("saving")
              : pending
                ? t("sending")
                : recipientCount > 0
                  ? dirty
                    ? t("saveAndSendTo", { count: recipientCount + 1 })
                    : t("sendTo", { count: recipientCount + 1 })
                  : dirty
                    ? t("saveAndSend")
                    : t("sendToClient")}
          </button>
          <button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={() => del.setConfirming(true)}>
            {t("deleteDraft")}
          </button>
        </>
      )}
      {confirmMsg}
      {saveError && (
        <p className={`${styles.publishError} ${styles.templateStatus}`} role="alert">
          {saveError}
        </p>
      )}
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
  const t = useTranslations("mealPlans.controls");
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
          {t("deleteConfirm", { name: planName })}
          {visibleToClient ? t("deleteHides") : ""} {t("diaryStays")}
        </p>
        <button type="button" className="btn btn-primary btn-sm btn-danger" onClick={del.doDelete} disabled={del.pending}>
          {del.pending ? t("deleting") : t("yesDelete")}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => del.setConfirming(false)} disabled={del.pending}>
          {t("cancel")}
        </button>
        {del.error && <p className={`${styles.publishError} ${styles.templateStatus}`}>{del.error}</p>}
      </div>
    );
  }

  return (
    <div className={styles.templateGrid}>
      <a href={`/api/export/meal-plan/${planId}/pdf`} className="btn btn-ghost btn-sm">
        {t("downloadPdf")}
      </a>
      <button type="button" className="btn btn-ghost btn-sm" onClick={saveTemplate} disabled={templatePending}>
        {templatePending ? t("saving") : t("saveTemplate")}
      </button>
      {published && (
        <button type="button" className={`btn btn-ghost btn-sm btn-danger ${styles.dangerGhost}`} onClick={() => del.setConfirming(true)}>
          {t("delete")}
        </button>
      )}
      {!templatePending && templateState.error && (
        <span className={`${styles.noWorkouts} ${styles.templateStatus}`}>{templateState.error}</span>
      )}
      {!templatePending && templateState !== initialState && !templateState.error && (
        <span className={`${styles.clientSince} ${styles.templateStatus}`}>
          {t.rich("savedTemplate", { link: (chunks) => <Link href="/dashboard/sablony">{chunks}</Link> })}
        </span>
      )}
    </div>
  );
}
