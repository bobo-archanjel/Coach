"use client";

import { useEffect, useState, useTransition } from "react";
import { leaveTrainerAction } from "../actions";
import styles from "../portal.module.css";

const CopyIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
    <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);
const CheckIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ShareIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M8 10.5V2.5M8 2.5 5 5.5M8 2.5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3.5 8v4.5A1 1 0 0 0 4.5 13.5h7a1 1 0 0 0 1-1V8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

/**
 * Profil klienta — jeho kód pre trénera + stav prepojenia (feature/registracia-update).
 * Kód generuje DB (handle_new_user, 0032), tu sa len zobrazuje/kopíruje/zdieľa.
 * Odpojenie od trénera (leave_trainer) nechá všetky vlastné dáta klienta.
 */
export function TrainerConnection({
  code,
  trainerName,
}: {
  code: string | null;
  trainerName: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [leavePending, startLeave] = useTransition();

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const shareText = code
    ? `Pridaj ma ako svojho klienta vo FitPilot. Môj kód: ${code}`
    : "";

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const share = async () => {
    if (!code) return;
    try {
      await navigator.share({ title: "Môj FitPilot kód", text: shareText });
    } catch {
      /* používateľ zrušil zdieľanie — nič nerobíme */
    }
  };

  const leave = () => {
    setLeaveError(null);
    startLeave(async () => {
      const res = await leaveTrainerAction();
      if (res.error) setLeaveError(res.error);
      else setConfirmLeave(false);
    });
  };

  return (
    <div className={styles.panel}>
      <p className={styles.panelLabel}>Tvoj kód pre trénera</p>

      {code ? (
        <>
          <div className={styles.codeRow}>
            <code className={styles.codeValue}>{code}</code>
            <div className={styles.codeActions}>
              <button type="button" className={styles.codeBtn} onClick={copy} aria-live="polite">
                {copied ? <CheckIcon /> : <CopyIcon />}
                {copied ? "Skopírované" : "Kopírovať"}
              </button>
              {canShare && (
                <button type="button" className={styles.codeBtn} onClick={share}>
                  <ShareIcon />
                  Zdieľať
                </button>
              )}
            </div>
          </div>
          <p className={styles.codeHint}>
            Pošli tento kód svojmu trénerovi. Zadá ho u seba a tým sa napojíte — appku dovtedy plne používaš aj sám.
          </p>
        </>
      ) : (
        <p className={styles.codeHint}>Kód sa práve pripravuje — obnov stránku o chvíľu.</p>
      )}

      <div className={styles.trainerStatus}>
        <p className={styles.panelLabel} style={{ marginTop: 4, marginBottom: 10 }}>
          Tréner
        </p>
        {trainerName ? (
          <>
            <p className={styles.trainerName}>
              <span className={styles.trainerDot} aria-hidden="true" />
              Prepojený/á s trénerom <strong>{trainerName}</strong>
            </p>
            {confirmLeave ? (
              <div className={styles.trainerLeaveConfirm}>
                <p className={styles.codeHint} style={{ marginTop: 0 }}>
                  Odpojiť sa od trénera {trainerName}? Tvoje tréningy, merania a denník ostávajú — tréner k nim už
                  nebude mať prístup.
                </p>
                <div className={styles.trainerLeaveActions}>
                  <button type="button" className="btn btn-primary btn-sm" onClick={leave} disabled={leavePending}>
                    {leavePending ? "Odpájam…" : "Áno, odpojiť"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setConfirmLeave(false)}
                    disabled={leavePending}
                  >
                    Zrušiť
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmLeave(true)}>
                Odpojiť sa od trénera
              </button>
            )}
            {leaveError && <p className={styles.dzError}>{leaveError}</p>}
          </>
        ) : (
          <p className={styles.codeHint} style={{ marginTop: 0 }}>
            Zatiaľ nemáš trénera. Keď mu pošleš kód vyššie a on ťa pridá, uvidíš tu jeho meno a v Chate ti príde
            potvrdenie.
          </p>
        )}
      </div>
    </div>
  );
}
