"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addClientAction, addClientByCodeAction, type AddClientState, type AddByCodeState } from "./actions";
import styles from "./dashboard.module.css";

const initialState: AddClientState = { error: null };
const initialCodeState: AddByCodeState = { error: null, addedName: null };

const CheckIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * "+ Nový klient" — dve cesty (feature/registracia-update):
 *  1. Klient už má účet → tréner zadá jeho kód (FP-…), appka ho napojí a klient
 *     dostane potvrdenie do chatu. Toto je primárna cesta.
 *  2. Klient ešte nemá účet → tréner mu vytvorí záznam ako doteraz (a dá mu kód,
 *     ktorý si klient pri registrácii nárokuje — pôvodný flow, ostáva funkčný).
 */
export function AddClientForm() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"code" | "manual">("code");

  const [manualState, manualAction, manualPending] = useActionState(addClientAction, initialState);
  const [codeState, codeAction, codePending] = useActionState(addClientByCodeAction, initialCodeState);

  const prevManualPending = useRef(false);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (prevManualPending.current && !manualPending && !manualState.error) setOpen(false);
    prevManualPending.current = manualPending;
  }, [manualPending, manualState.error]);

  // Po úspešnom pridaní kódom vyčisti pole — tréner môže rovno pridať ďalšieho.
  useEffect(() => {
    if (codeState.addedName && codeInputRef.current) codeInputRef.current.value = "";
  }, [codeState.addedName]);

  if (!open) {
    return (
      <div className={styles.addClientForm}>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
          + Nový klient
        </button>
      </div>
    );
  }

  return (
    <div className={`${styles.addClientForm} ${styles.addClientPanel}`}>
      <div className={styles.addClientModes} role="tablist" aria-label="Ako pridať klienta">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "code"}
          className={`${styles.addClientModeBtn} ${mode === "code" ? styles.addClientModeActive : ""}`}
          onClick={() => setMode("code")}
        >
          Má FitPilot účet
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "manual"}
          className={`${styles.addClientModeBtn} ${mode === "manual" ? styles.addClientModeActive : ""}`}
          onClick={() => setMode("manual")}
        >
          Ešte nemá účet
        </button>
      </div>

      {mode === "code" ? (
        <form action={codeAction}>
          <p className={styles.addClientHint}>
            Klient si nájde svoj kód v appke v <strong>Profile</strong> a pošle ti ho. Zadaj ho sem — hneď sa napojí a
            dostane potvrdenie.
          </p>
          <div className={styles.addClientFields}>
            <input
              ref={codeInputRef}
              name="code"
              type="text"
              placeholder="FP-XXXXXXXXXXXXXXXXXXXX"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
              disabled={codePending}
              className={styles.addClientInput}
              aria-label="Kód klienta"
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={codePending}>
              {codePending ? "Pridávam…" : "Pridať klienta"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={codePending}>
              Zavrieť
            </button>
          </div>
          {codeState.error && <p className={styles.addClientError}>{codeState.error}</p>}
          {codeState.addedName && !codeState.error && (
            <p className={styles.addClientOk} role="status">
              <CheckIcon />
              {codeState.addedName} pridaný/-á do zoznamu. Klient dostal potvrdenie.
            </p>
          )}
        </form>
      ) : (
        <form action={manualAction}>
          <p className={styles.addClientHint}>
            Vytvoríme mu záznam a vygenerujeme kód, ktorý si klient nárokuje pri registrácii.
          </p>
          <div className={styles.addClientFields}>
            <input name="full_name" type="text" placeholder="Meno a priezvisko" required disabled={manualPending} className={styles.addClientInput} />
            <input name="goal" type="text" placeholder="Cieľ (napr. chudnutie)" disabled={manualPending} className={styles.addClientInput} />
          </div>
          <div className={styles.addClientFieldsRow}>
            <input name="age" type="number" inputMode="numeric" placeholder="Vek" min={1} max={119} disabled={manualPending} className={styles.addClientInputSm} />
            <input name="weight_kg" type="number" inputMode="decimal" placeholder="Váha (kg)" min={1} step="0.1" disabled={manualPending} className={styles.addClientInputSm} />
            <input name="height_cm" type="number" inputMode="decimal" placeholder="Výška (cm)" min={1} step="0.1" disabled={manualPending} className={styles.addClientInputSm} />
          </div>
          <div className={styles.addClientFields}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={manualPending}>
              {manualPending ? "Pridávam…" : "Vytvoriť záznam"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={manualPending}>
              Zrušiť
            </button>
          </div>
          {manualState.error && <p className={styles.addClientError}>{manualState.error}</p>}
        </form>
      )}
    </div>
  );
}
