"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { saveWorkoutTemplateAction, type ActionState } from "./actions";
import { PLAN_GOALS, PLAN_GOAL_LABEL_SK } from "@/lib/planGoals";
import styles from "../dashboard.module.css";

const initialState: ActionState = { error: null };

/**
 * "Uložiť ako šablónu" na detaile tréningového plánu — cieľ + uloženie v 2-stĺpcovej
 * mriežke (templateGrid) pod publikovaním. Šablóna sa ukladá pod názvom plánu;
 * iný názov = premenovať plán ceruzkou pri nadpise (PlanTitle). Jedálniček ďalej
 * používa SaveTemplateForm.
 */
export function WorkoutTemplateTop({ planId, defaultName }: { planId: string; defaultName: string }) {
  const [state, formAction, pending] = useActionState(saveWorkoutTemplateAction, initialState);
  const [, startTransition] = useTransition();
  const [goal, setGoal] = useState("");

  const save = () => {
    const fd = new FormData();
    fd.set("plan_id", planId);
    fd.set("name", defaultName);
    fd.set("goal", goal);
    startTransition(() => formAction(fd));
  };

  return (
    <div className={styles.templateGrid}>
      <select
        aria-label="Cieľ šablóny"
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        disabled={pending}
        className={styles.addClientInput}
      >
        <option value="">Bez cieľa</option>
        {PLAN_GOALS.map((g) => (
          <option key={g} value={g}>
            {PLAN_GOAL_LABEL_SK[g]}
          </option>
        ))}
      </select>
      <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={save}>
        {pending ? "Ukladám…" : "Uložiť ako šablónu"}
      </button>
      {!pending && state.error && (
        <span className={`${styles.noWorkouts} ${styles.templateStatus}`}>{state.error}</span>
      )}
      {!pending && state !== initialState && !state.error && (
        <span className={`${styles.clientSince} ${styles.templateStatus}`}>
          Uložené — pozri v <Link href="/dashboard/sablony">Šablónach</Link>.
        </span>
      )}
    </div>
  );
}
