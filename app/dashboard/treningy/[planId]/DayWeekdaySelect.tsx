"use client";

import { useActionState, useRef } from "react";
import { setDayWeekdayAction, type ActionState } from "../actions";
import styles from "./builder.module.css";

const initialState: ActionState = { error: null };

const WEEKDAY_OPTIONS = [
  { value: 1, label: "Pondelok" },
  { value: 2, label: "Utorok" },
  { value: 3, label: "Streda" },
  { value: 4, label: "Štvrtok" },
  { value: 5, label: "Piatok" },
  { value: 6, label: "Sobota" },
  { value: 7, label: "Nedeľa" },
];

/**
 * Ktorý deň v týždni sa tento tréningový deň cvičí — klientský portál (/portal
 * "Dnes") podľa toho vyberá dnešný tréning. Bez tohto nastavenia portál vždy
 * ukáže "voľno", aj keď plán má reálne dni s cvikmi. Select sa odošle hneď pri
 * zmene (netreba samostatné tlačidlo "Uložiť").
 */
export function DayWeekdaySelect({ dayId, planId, weekday }: { dayId: string; planId: string; weekday: number | null }) {
  const [state, formAction, pending] = useActionState(setDayWeekdayAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={formAction} className={styles.weekdayForm}>
      <input type="hidden" name="day_id" value={dayId} readOnly />
      <input type="hidden" name="plan_id" value={planId} readOnly />
      <label className={styles.weekdayLabel}>
        Deň v týždni
        <select
          name="weekday"
          defaultValue={weekday ?? ""}
          disabled={pending}
          onChange={() => formRef.current?.requestSubmit()}
        >
          <option value="">Bez pevného dňa</option>
          {WEEKDAY_OPTIONS.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </select>
      </label>
      {state.error && <span className={styles.formError}>{state.error}</span>}
    </form>
  );
}
