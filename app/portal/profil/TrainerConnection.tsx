"use client";

import { useTranslations } from "next-intl";
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
  hasTrainer,
  trainerName,
}: {
  code: string | null;
  hasTrainer: boolean;
  /** Meno na zobrazenie — môže byť null aj keď hasTrainer je true (meno sa
   * nepodarilo zistiť); šablóny nižšie preto meno vypisujú len keď je k dispozícii. */
  trainerName: string | null;
}) {
  const t = useTranslations("profile.connection");
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
    ? t("shareText", { code })
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
      await navigator.share({ title: t("shareTitle"), text: shareText });
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
      {/* Kód len pre klienta bez trénera — spárovaného klienta by iný tréner aj tak
          odmietol (add_client_by_code → already_has_trainer), takže kód s výzvou
          "pošli ho trénerovi" len mätie (QA 2026-09-23). Po odpojení sa znova ukáže. */}
      {!hasTrainer && <p className={styles.panelLabel}>{t("codeLabel")}</p>}

      {hasTrainer ? null : code ? (
        <>
          <div className={styles.codeRow}>
            <code className={styles.codeValue}>{code}</code>
            <div className={styles.codeActions}>
              <button type="button" className={styles.codeBtn} onClick={copy} aria-live="polite">
                {copied ? <CheckIcon /> : <CopyIcon />}
                {copied ? t("copied") : t("copy")}
              </button>
              {canShare && (
                <button type="button" className={styles.codeBtn} onClick={share}>
                  <ShareIcon />
                  {t("share")}
                </button>
              )}
            </div>
          </div>
          <p className={styles.codeHint}>
            {t("codeHint")}
          </p>
        </>
      ) : (
        <p className={styles.codeHint}>{t("codePending")}</p>
      )}

      <div
        className={styles.trainerStatus}
        style={hasTrainer ? { marginTop: 0, paddingTop: 0, borderTop: "none" } : undefined}
      >
        <p className={styles.panelLabel} style={{ marginTop: hasTrainer ? 0 : 4, marginBottom: 10 }}>
          {t("trainer")}
        </p>
        {hasTrainer ? (
          <>
            <p className={styles.trainerName}>
              <span className={styles.trainerDot} aria-hidden="true" />
              {trainerName ? (
                t.rich("linkedWith", { name: trainerName, b: (chunks) => <strong>{chunks}</strong> })
              ) : (
                t("linked")
              )}
            </p>
            {confirmLeave ? (
              <div className={styles.trainerLeaveConfirm}>
                <p className={styles.codeHint} style={{ marginTop: 0 }}>
                  {trainerName ? t("leaveNamed", { name: trainerName }) : t("leave")} {t("leaveText")}
                </p>
                <div className={styles.trainerLeaveActions}>
                  <button type="button" className="btn btn-primary btn-sm" onClick={leave} disabled={leavePending}>
                    {leavePending ? t("leaving") : t("yesLeave")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setConfirmLeave(false)}
                    disabled={leavePending}
                  >
                    {t("cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmLeave(true)}>
                {t("leaveButton")}
              </button>
            )}
            {leaveError && <p className={styles.dzError}>{leaveError}</p>}
          </>
        ) : (
          <p className={styles.codeHint} style={{ marginTop: 0 }}>
            {t("noTrainer")}
          </p>
        )}
      </div>
    </div>
  );
}
