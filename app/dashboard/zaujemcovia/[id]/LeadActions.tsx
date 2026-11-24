"use client";

// Akcie pri záujemcovi: stav, poznámky, pozvánka, zmazanie. Zobrazenie a pohodlie — všetko znova
// overuje server (../actions.ts: session, rola, prechody stavov, limity pozvánok, RLS).

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { charLength } from "@/lib/branding/validation";
import { LEAD_LIMITS_TEXT, LEAD_STATUSES, canSetStatus, type LeadStatus } from "@/lib/publicPage/leads";
import { deleteLeadAction, inviteLeadAction, saveLeadNotesAction, setLeadStatusAction } from "../actions";
import styles from "@/app/dashboard/dashboard.module.css";
import b from "@/app/dashboard/nastavenia/branding.module.css";
import l from "../leads.module.css";
import pa from "@/app/components/planActions.module.css";

export function LeadActions({
  id,
  status,
  notes,
  invitedAt,
  replyHref,
  mailReady,
}: {
  id: string;
  status: LeadStatus;
  notes: string;
  invitedAt: string | null;
  replyHref: string;
  mailReady: boolean;
}) {
  const t = useTranslations("publicPage.leads");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [text, setText] = useState(notes);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function run(fn: () => Promise<{ error: string | null }>, ok?: string) {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await fn();
      if (res?.error) setError(res.error);
      else if (ok) setInfo(ok);
    });
  }

  return (
    <div className={l.side}>
      <section className={styles.card} aria-label={t("setStatus")}>
        <h3>{t("setStatus")}</h3>
        <div className={l.statusRow} role="group" aria-label={t("setStatus")}>
          {LEAD_STATUSES.map((s) => {
            const current = s === status;
            return (
              <button
                key={s}
                type="button"
                className={`${l.statusBtn} ${current ? l.statusBtnOn : ""}`}
                aria-pressed={current}
                disabled={pending || current || !canSetStatus(status, s)}
                onClick={() => run(() => setLeadStatusAction(id, s))}
                data-testid={`lead-status-${s}`}
              >
                {t(`status.${s}`)}
              </button>
            );
          })}
        </div>
        {invitedAt && <p className={l.hint}>{t("invitedAt", { date: invitedAt })}</p>}

        <div className={l.actionRow}>
          <button type="button" className={`${pa.action} ${pa.primary}`} disabled={pending || !mailReady} onClick={() => run(() => inviteLeadAction(id), t("invited"))} data-testid="lead-invite">
            {pending ? t("inviting") : t("invite")}
          </button>
          <a href={replyHref} className={`${pa.action} ${pa.small} ${pa.inline}`}>
            {t("reply")}
          </a>
        </div>
        <p className={l.hint}>{mailReady ? t("inviteHint") : t("errors.mailNotConfigured")}</p>
      </section>

      <section className={styles.card} aria-label={t("notes")}>
        <h3>{t("notes")}</h3>
        <div className={b.field}>
          <textarea className={b.textarea} rows={5} value={text} maxLength={LEAD_LIMITS_TEXT.notesMax} onChange={(e) => setText(e.target.value)} aria-label={t("notes")} data-testid="lead-notes" />
          <span className={b.count}>
            {charLength(text)} / {LEAD_LIMITS_TEXT.notesMax}
          </span>
          <p className={b.hint}>{t("notesHint", { max: LEAD_LIMITS_TEXT.notesMax })}</p>
        </div>
        <button type="button" className={`${pa.action} ${pa.small} ${pa.inline}`} disabled={pending || text === notes} onClick={() => run(() => saveLeadNotesAction(id, text), t("notesSaved"))}>
          {t("saveNotes")}
        </button>
      </section>

      {(error || info) && (
        <p className={error ? b.err : b.ok} role={error ? "alert" : "status"}>
          {error ?? info}
        </p>
      )}

      <section className={styles.card} aria-label={t("delete")}>
        <h3>{t("delete")}</h3>
        <p className={l.hint}>{t("deleteHint")}</p>
        {confirmDelete ? (
          <div className={l.actionRow}>
            <span className={l.confirmText}>{t("deleteConfirm")}</span>
            <button type="button" className={`${pa.action} ${pa.small} ${pa.inline} ${pa.danger}`} disabled={pending} onClick={() => run(() => deleteLeadAction(id))} data-testid="lead-delete-yes">
              {pending ? t("deleting") : t("deleteYes")}
            </button>
            <button type="button" className={`${pa.action} ${pa.small} ${pa.inline}`} disabled={pending} onClick={() => setConfirmDelete(false)}>
              {t("deleteNo")}
            </button>
          </div>
        ) : (
          <button type="button" className={`${pa.action} ${pa.small} ${pa.inline} ${pa.danger}`} onClick={() => setConfirmDelete(true)} data-testid="lead-delete">
            {t("delete")}
          </button>
        )}
      </section>
    </div>
  );
}
