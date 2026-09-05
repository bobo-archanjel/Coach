"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { saveWorkoutTemplateAction, saveMealTemplateAction, type ActionState } from "./actions";
import { PLAN_GOALS, PLAN_GOAL_LABEL_SK } from "@/lib/planGoals";
import styles from "../dashboard.module.css";

const initialState: ActionState = { error: null };

/**
 * "Uložiť ako šablónu" — na detaile tréningového plánu aj jedálničku (`kind` rozlišuje
 * akciu). Meno šablóny je voliteľné pole schované za tlačidlom "Iný názov" — v drvivej
 * väčšine prípadov stačí názov plánu, netreba vynucovať extra krok pri každom uložení.
 */
export function SaveTemplateForm({ kind, planId, defaultName }: { kind: "workout" | "meal"; planId: string; defaultName: string }) {
  const action = kind === "workout" ? saveWorkoutTemplateAction : saveMealTemplateAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [renaming, setRenaming] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <form action={formAction} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <input type="hidden" name="plan_id" value={planId} />
      {renaming ? (
        <input
          type="text"
          name="name"
          defaultValue={defaultName}
          maxLength={120}
          disabled={pending}
          className={styles.addClientInput}
          style={{ maxWidth: 220 }}
        />
      ) : (
        <input type="hidden" name="name" value={defaultName} />
      )}
      {kind === "workout" && (
        <select name="goal" disabled={pending} className={styles.addClientInput} defaultValue="" style={{ maxWidth: 170 }}>
          <option value="">Bez cieľa (filter)</option>
          {PLAN_GOALS.map((g) => (
            <option key={g} value={g}>
              {PLAN_GOAL_LABEL_SK[g]}
            </option>
          ))}
        </select>
      )}
      <button type="submit" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => setSaved(true)}>
        {pending ? "Ukladám…" : "Uložiť ako šablónu"}
      </button>
      {!renaming && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenaming(true)} disabled={pending}>
          Iný názov
        </button>
      )}
      {saved && !pending && !state.error && (
        <span className={styles.clientSince}>
          Uložené — pozri v <Link href="/dashboard/sablony">Šablónach</Link>.
        </span>
      )}
      {state.error && <span className={styles.noWorkouts}>{state.error}</span>}
    </form>
  );
}
