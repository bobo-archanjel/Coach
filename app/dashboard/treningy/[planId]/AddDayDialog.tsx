"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef } from "react";
import { addDayAction, type ActionState } from "../actions";
import { BuilderDialog } from "@/app/components/BuilderDialog";
import d from "@/app/components/builderDialog.module.css";

const initialState: ActionState = { error: null };

/**
 * „+ deň“ v trénerovom builderi — okno s názvom nového dňa (otvára ho „+ deň“ v dráhe
 * dní, PlanBuilder). Deň sa hneď uloží; po úspechu sa okno zavrie a PlanBuilder
 * prepne na nový deň.
 */
export function AddDayDialog({
  planId,
  nextDayNumber,
  onClose,
}: {
  planId: string;
  nextDayNumber: number;
  /** added = deň sa uložil (PlanBuilder naň prepne), false = zatvorené bez pridania */
  onClose: (added: boolean) => void;
}) {
  const t = useTranslations("plans.builder");
  const [state, formAction, pending] = useActionState(addDayAction, initialState);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) onClose(true);
    wasPending.current = pending;
  }, [pending, state.error, onClose]);

  return (
    <BuilderDialog title={t("newDayTitle")} closeLabel={t("close")} onClose={() => !pending && onClose(false)}>
      <form action={formAction} className={d.form}>
        <input type="hidden" name="plan_id" value={planId} readOnly />
        <input type="hidden" name="day_number" value={nextDayNumber} readOnly />
        <div className={d.field}>
          <label htmlFor="trainer-day-name" className={d.label}>
            {t("dayName")}
          </label>
          <input
            id="trainer-day-name"
            name="name"
            type="text"
            placeholder={t("dayPlaceholder", { n: nextDayNumber })}
            maxLength={120}
            // Zámerne bez `required` — natívna HTML5 validačná bublina ("Please fill
            // out this field") sa riadi jazykom PREHLIADAČA, nie appky (QA nález #7).
            // `addDayAction` (../actions.ts) prázdny názov odmietne s vlastnou hláškou
            // cez `state.error` nižšie.
            autoFocus
            disabled={pending}
            className={d.input}
          />
        </div>
        {state.error && (
          <p className={d.error} role="alert">
            {state.error}
          </p>
        )}
        <div className={d.actions}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onClose(false)} disabled={pending}>
            {t("cancel")}
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
            {pending ? "…" : t("add")}
          </button>
        </div>
      </form>
    </BuilderDialog>
  );
}
