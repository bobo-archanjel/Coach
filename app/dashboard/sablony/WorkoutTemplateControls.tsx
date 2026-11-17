"use client";

import { useTranslations } from "next-intl";
import { useActionState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { saveWorkoutTemplateAction, type ActionState } from "./actions";
import styles from "../dashboard.module.css";
import pa from "@/app/components/planActions.module.css";
import { ActionTemplateIcon } from "@/app/components/ActionIcons";

const initialState: ActionState = { error: null };

/**
 * "Uložiť ako šablónu" na detaile tréningového plánu — v spodných akciách vedľa
 * "Stiahnuť PDF" (PlanFooterActions), v 2-stĺpcovej mriežke (templateGrid). Šablóna
 * sa ukladá pod názvom plánu; iný názov = premenovať plán ceruzkou pri nadpise
 * (PlanTitle). Cieľ šablóny sa už nevyberá (feature/design-fixes). Jedálniček má
 * vlastné tlačidlo v MealPlanFooterActions. `leading` / `trailing` = ďalšie tlačidlá
 * v tej istej mriežke (PDF pred, Zmazať za).
 */
export function WorkoutTemplateSave({
  planId,
  defaultName,
  leading,
  trailing,
}: {
  planId: string;
  defaultName: string;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  const t = useTranslations("templates.save");
  const [state, formAction, pending] = useActionState(saveWorkoutTemplateAction, initialState);
  const [, startTransition] = useTransition();

  const save = () => {
    const fd = new FormData();
    fd.set("plan_id", planId);
    fd.set("name", defaultName);
    startTransition(() => formAction(fd));
  };

  return (
    <div className={styles.footActions}>
      <div className={pa.grid}>
        {leading}
        <button type="button" className={pa.action} disabled={pending} onClick={save}>
          <ActionTemplateIcon />
          {pending ? t("saving") : t("save")}
        </button>
        {trailing}
      </div>
      {!pending && state.error && (
        <span className={`${styles.noWorkouts} ${styles.templateStatus}`}>{state.error}</span>
      )}
      {!pending && state !== initialState && !state.error && (
        <span className={`${styles.clientSince} ${styles.templateStatus}`}>
          {t.rich("saved", { link: (chunks) => <Link href="/dashboard/sablony">{chunks}</Link> })}
        </span>
      )}
    </div>
  );
}
