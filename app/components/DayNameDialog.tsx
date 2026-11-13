"use client";

import { useState } from "react";
import { BuilderDialog } from "./BuilderDialog";
import d from "./builderDialog.module.css";

/**
 * Okno s názvom dňa — „+ deň“ aj „Premenovať“ v buildri tréningu (tréner, klient) aj
 * jedálnička. Enter odošle, Esc / ✕ / Zrušiť / klik mimo zavrú. `onSubmit` vráti chybu
 * (zostane v okne) alebo null (volajúci okno zavrie sám, napr. po uložení na server).
 */
export function DayNameDialog({
  title,
  label,
  inputId,
  initialValue = "",
  placeholder,
  maxLength = 120,
  submitLabel,
  cancelLabel,
  closeLabel,
  pending = false,
  error = null,
  onSubmit,
  onClose,
}: {
  title: string;
  label: string;
  inputId: string;
  initialValue?: string;
  placeholder?: string;
  maxLength?: number;
  submitLabel: string;
  cancelLabel: string;
  closeLabel: string;
  pending?: boolean;
  /** chyba zvonku (napr. zo servera) */
  error?: string | null;
  /** vráti chybovú hlášku, ak názov neprešiel (okno ostane otvorené) */
  onSubmit: (name: string) => string | null | void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [localError, setLocalError] = useState<string | null>(null);
  const shownError = localError ?? error;

  return (
    <BuilderDialog title={title} closeLabel={closeLabel} onClose={() => !pending && onClose()}>
      <form
        className={d.form}
        onSubmit={(e) => {
          e.preventDefault();
          const err = onSubmit(value.trim());
          setLocalError(err || null);
        }}
      >
        <div className={d.field}>
          <label htmlFor={inputId} className={d.label}>
            {label}
          </label>
          <input
            id={inputId}
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (localError) setLocalError(null);
            }}
            placeholder={placeholder}
            maxLength={maxLength}
            autoFocus
            // pri premenovaní je pôvodný názov označený — dá sa hneď prepísať
            onFocus={(e) => e.currentTarget.select()}
            disabled={pending}
            className={d.input}
          />
        </div>
        {shownError && (
          <p className={d.error} role="alert">
            {shownError}
          </p>
        )}
        <div className={d.actions}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={pending}>
            {cancelLabel}
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
            {submitLabel}
          </button>
        </div>
      </form>
    </BuilderDialog>
  );
}
