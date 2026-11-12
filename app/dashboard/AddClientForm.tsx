"use client";

import { useTranslations } from "next-intl";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { addClientAction, addClientByCodeAction, type AddClientState, type AddByCodeState } from "./actions";
import type { RosterItem } from "./ClientRoster";
import { InfoTip } from "@/app/components/InfoTip";
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
/** Očakávaný tvar kódu: FP- + 20 hex znakov (viď add_client_by_code RPC). */
const CODE_PREFIX = "FP-";
const CODE_BODY_LEN = 20;

/** Forgiving formatting — veľké písmená, bez medzier, zachová "FP-" prefix aj
 * keď ho niekto pri copy-paste čiastočne prepíše. */
function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, "");
}

export function AddClientForm({ onOptimisticAdd }: { onOptimisticAdd?: (item: RosterItem) => void }) {
  const t = useTranslations("clients.add");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"code" | "manual">("code");
  const [codeValue, setCodeValue] = useState("");

  const [manualState, manualAction, manualPending] = useActionState(addClientAction, initialState);
  const [codeState, codeAction, codePending] = useActionState(addClientByCodeAction, initialCodeState);

  const prevManualPending = useRef(false);

  useEffect(() => {
    if (prevManualPending.current && !manualPending && !manualState.error) setOpen(false);
    prevManualPending.current = manualPending;
  }, [manualPending, manualState.error]);

  // Po úspešnom pridaní kódom vyčisti pole — tréner môže rovno pridať ďalšieho.
  // `value={codeValue}` už robí toto pole plne kontrolovaným — priame nastavenie
  // `input.value` cez ref (predtým tu bolo) obchádza Reactovo sledovanie hodnoty
  // a spôsobovalo "changing from controlled to uncontrolled" warning.
  useEffect(() => {
    if (codeState.addedName) setCodeValue("");
  }, [codeState.addedName]);

  // Skok z prázdneho stavu zoznamu ("#add-client", EmptyState CTA) otvorí panel
  // rovno — inak by človek pristál len pri skrytom "+ Nový klient" tlačidle.
  useEffect(() => {
    if (window.location.hash === "#add-client") setOpen(true);
  }, []);

  const codeDigitsLen = Math.max(0, codeValue.length - CODE_PREFIX.length);

  if (!open) {
    return (
      <div id="add-client" className={styles.addClientForm}>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
          {t("newClient")}
        </button>
      </div>
    );
  }

  return (
    <div id="add-client" className={`${styles.addClientForm} ${styles.addClientPanel}`}>
      {/* Prepínač + otáznik s vysvetlením zvolenej cesty (InfoTip) v jednom riadku. */}
      <div className={styles.addClientModesRow}>
        <div className={styles.addClientModes} role="tablist" aria-label={t("modes")}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "code"}
            className={`${styles.addClientModeBtn} ${mode === "code" ? styles.addClientModeActive : ""}`}
            onClick={() => setMode("code")}
          >
            {t("hasAccount")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "manual"}
            className={`${styles.addClientModeBtn} ${mode === "manual" ? styles.addClientModeActive : ""}`}
            onClick={() => setMode("manual")}
          >
            {t("noAccount")}
          </button>
        </div>
        {mode === "code" ? (
          <InfoTip title={t("hasAccountTitle")}>
            {t.rich("hasAccountText", { b: (chunks) => <strong>{chunks}</strong> })}
          </InfoTip>
        ) : (
          <InfoTip title={t("noAccountTitle")}>{t("noAccountText")}</InfoTip>
        )}
      </div>

      {mode === "code" ? (
        <form action={codeAction}>
          <div className={styles.addClientFields}>
            <input
              name="code"
              type="text"
              value={codeValue}
              onChange={(e) => setCodeValue(normalizeCode(e.currentTarget.value))}
              placeholder="FP-XXXXXXXXXXXXXXXXXXXX"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
              disabled={codePending}
              className={styles.addClientInput}
              aria-label={t("code")}
              aria-describedby="add-client-code-count"
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={codePending}>
              {codePending ? t("adding") : t("addClient")}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={codePending}>
              {t("close")}
            </button>
          </div>
          {codeValue.length > 0 && (
            <p id="add-client-code-count" className={styles.addClientHint} style={{ marginTop: -8 }}>
              {t("codeCount", { count: codeDigitsLen, total: CODE_BODY_LEN })}
            </p>
          )}
          {codeState.error && <p className={styles.addClientError}>{codeState.error}</p>}
          {codeState.addedName && !codeState.error && (
            <p className={styles.addClientOk} role="status">
              <CheckIcon />
              {t("added", { name: codeState.addedName })}
            </p>
          )}
        </form>
      ) : (
        <form
          action={manualAction}
          onSubmit={(e) => {
            if (!onOptimisticAdd) return;
            const fd = new FormData(e.currentTarget);
            const fullName = String(fd.get("full_name") ?? "").trim();
            if (!fullName) return;
            const goal = String(fd.get("goal") ?? "").trim();
            startTransition(() => {
              onOptimisticAdd({
                id: `optimistic-${Date.now()}`,
                fullName,
                goal: goal || null,
                since: new Date().toISOString(),
                unread: 0,
                pendingDeletion: false,
                deletionLabel: null,
                ended: false,
                statusLabel: null,
                statusTone: null,
                pending: true,
              });
            });
          }}
        >
          <div className={styles.addClientFields}>
            <input name="full_name" type="text" placeholder={t("fullName")} required disabled={manualPending} className={styles.addClientInput} />
            <input name="goal" type="text" placeholder={t("goal")} disabled={manualPending} className={styles.addClientInput} />
          </div>
          {/* Viditeľné popisky nad poľami, nie placeholder: tri polia v riadku majú na
              mobile ~57–67px na text a „Výška (cm)" (85px pri 16px písme) sa orezávala.
              Rovnaký vzor ako Od/Do v AddAppointmentForm (.timeField). */}
          <div className={styles.addClientFieldsRow}>
            <label className={styles.timeField}>
              <span className={styles.timeFieldLabel}>{t("age")}</span>
              <input name="age" type="number" inputMode="numeric" min={1} max={119} disabled={manualPending} className={styles.addClientInputSm} />
            </label>
            <label className={styles.timeField}>
              <span className={styles.timeFieldLabel}>{t("weight")}</span>
              <input name="weight_kg" type="number" inputMode="decimal" min={1} step="0.1" disabled={manualPending} className={styles.addClientInputSm} />
            </label>
            <label className={styles.timeField}>
              <span className={styles.timeFieldLabel}>{t("height")}</span>
              <input name="height_cm" type="number" inputMode="decimal" min={1} step="0.1" disabled={manualPending} className={styles.addClientInputSm} />
            </label>
          </div>
          <div className={styles.addClientFields}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={manualPending}>
              {manualPending ? t("adding") : t("createRecord")}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={manualPending}>
              {t("cancel")}
            </button>
          </div>
          {manualState.error && <p className={styles.addClientError}>{manualState.error}</p>}
        </form>
      )}
    </div>
  );
}
