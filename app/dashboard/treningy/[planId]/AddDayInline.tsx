"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addDayAction, type ActionState } from "../actions";
import styles from "./builder.module.css";

const initialState: ActionState = { error: null };

export function AddDayInline({ planId, nextDayNumber }: { planId: string; nextDayNumber: number }) {
  const [adding, setAdding] = useState(false);
  const [state, formAction, pending] = useActionState(addDayAction, initialState);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      setAdding(false);
    }
    wasPending.current = pending;
  }, [pending, state.error]);

  if (!adding) {
    return (
      <button type="button" className={styles.addDayTab} onClick={() => setAdding(true)}>
        + deň
      </button>
    );
  }

  return (
    <form action={formAction} className={styles.addDayForm}>
      <input type="hidden" name="plan_id" value={planId} readOnly />
      <input type="hidden" name="day_number" value={nextDayNumber} readOnly />
      <input
        name="name"
        type="text"
        placeholder={`napr. Deň ${nextDayNumber} — Push`}
        // Zámerne bez `required` — natívna HTML5 validačná bublina ("Please fill
        // out this field") sa riadi jazykom PREHLIADAČA, nie appky, takže na
        // anglicky nastavenom prehliadači vyskočí anglický text v inak
        // slovenskej appke (QA nález #7). `addDayAction` (../actions.ts) už
        // prázdny názov odmietne s vlastnou slovenskou hláškou ("Zadaj názov
        // dňa.") cez `state.error` nižšie — netreba duplicitnú JS validáciu.
        autoFocus
        disabled={pending}
        className={styles.addDayInput}
      />
      <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
        {pending ? "…" : "Pridať"}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(false)} disabled={pending}>
        Zrušiť
      </button>
      {state.error && <p className={styles.formError}>{state.error}</p>}
    </form>
  );
}
