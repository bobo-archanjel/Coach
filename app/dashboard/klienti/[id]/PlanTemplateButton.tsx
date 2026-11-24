"use client";

import { useTranslations } from "next-intl";
import { useActionState, useTransition } from "react";
import Link from "next/link";
import { saveWorkoutTemplateAction, type ActionState } from "@/app/dashboard/sablony/actions";
import pa from "@/app/components/planActions.module.css";
import styles from "../../dashboard.module.css";
import { ActionTemplateIcon } from "@/app/components/ActionIcons";

const initialState: ActionState = { error: null };

/**
 * „Uložiť ako šablónu“ na karte plánu v detaile klienta → Tréningy (ako u klienta) — tenké
 * tlačidlo v hornom rade vedľa „Nastaviť ako aktívny“. Šablóna sa uloží pod názvom plánu
 * (rovnaká akcia ako v detaile plánu, WorkoutTemplateSave).
 */
export function PlanTemplateButton({ planId, planName }: { planId: string; planName: string }) {
  const t = useTranslations("templates.save");
  const [state, formAction, pending] = useActionState(saveWorkoutTemplateAction, initialState);
  const [, startTransition] = useTransition();

  const save = () => {
    const fd = new FormData();
    fd.set("plan_id", planId);
    fd.set("name", planName);
    startTransition(() => formAction(fd));
  };

  return (
    <span className={styles.planTplAction}>
      <button type="button" className={`${pa.action} ${pa.wide}`} disabled={pending} onClick={save}>
        <ActionTemplateIcon />
        {pending ? t("saving") : t("save")}
      </button>
      {!pending && state.error && (
        <span className={styles.publishError} role="alert">
          {state.error}
        </span>
      )}
      {!pending && state !== initialState && !state.error && (
        <span className={styles.planTplSaved} role="status">
          {t.rich("saved", { link: (chunks) => <Link href="/dashboard/sablony">{chunks}</Link> })}
        </span>
      )}
    </span>
  );
}
