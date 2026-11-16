"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { TIMED_MAX_S, timedReps, timedSeconds } from "@/lib/workouts/timedReps";
import styles from "./workoutBuilder.module.css";

/**
 * Pole „Opakovania / Čas“ v úprave cviku (builder trénera aj klienta). Prepínač
 * vyberie, či sa cvik meria opakovaniami („10“, „8-12“) alebo časom (sekundy —
 * statické holdy, plank). Do formulára ide vždy jedno skryté pole `reps`:
 * opakovania ako text, čas ako „60 s“ (lib/workouts/timedReps.ts).
 */
export function RepsOrTimeField({ defaultValue, className }: { defaultValue: string; className?: string }) {
  const t = useTranslations("labels.repsMode");
  const id = useId();
  const initialSeconds = timedSeconds(defaultValue);
  const [mode, setMode] = useState<"reps" | "time">(initialSeconds != null ? "time" : "reps");
  const [reps, setReps] = useState(initialSeconds != null ? "" : defaultValue);
  const [seconds, setSeconds] = useState(initialSeconds != null ? String(initialSeconds) : "");

  const secNum = Number(seconds);
  const value =
    mode === "time" ? (seconds.trim() && Number.isInteger(secNum) && secNum > 0 ? timedReps(secNum) : "") : reps.trim();

  return (
    <div className={`${styles.editField} ${className ?? ""}`} role="group" aria-labelledby={`${id}-mode`}>
      <div className={styles.modeToggle} role="radiogroup" id={`${id}-mode`} aria-label={t("aria")}>
        {(["reps", "time"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            className={mode === m ? styles.modeOn : undefined}
            onClick={() => setMode(m)}
          >
            {t(m)}
          </button>
        ))}
      </div>
      {mode === "reps" ? (
        <input
          type="text"
          maxLength={20}
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          placeholder="10 / 8-12"
          aria-label={t("reps")}
          required
        />
      ) : (
        <div className={styles.secondsInput}>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={TIMED_MAX_S}
            step={1}
            value={seconds}
            onChange={(e) => setSeconds(e.target.value)}
            placeholder="60"
            aria-label={t("timeAria")}
            required
          />
          <span aria-hidden="true">s</span>
        </div>
      )}
      <input type="hidden" name="reps" value={value} />
    </div>
  );
}
