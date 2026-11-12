"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { removePlanRecipientAction, sendToRemainingRecipientsAction } from "./planRecipientActions";
import type { PlanKind, PlanRecipient } from "@/lib/planRecipients";
import styles from "./dashboard.module.css";

const CloseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

/**
 * Ďalší príjemcovia konceptu (šablóna pre viacerých klientov, 0052) pod menom klienta
 * v builderi. Koncept: „Pošle sa aj: …“ s možnosťou príjemcu odobrať. Odoslaný plán so
 * zvyšnými príjemcami = doručenie niekomu zlyhalo → „Poslať znova“.
 */
export function PlanRecipients({
  kind,
  planId,
  published,
  recipients,
}: {
  kind: PlanKind;
  planId: string;
  published: boolean;
  recipients: PlanRecipient[];
}) {
  const [pending, startTransition] = useTransition();
  const t = useTranslations("clients.recipients");
  const [error, setError] = useState<string | null>(null);
  if (recipients.length === 0) return null;

  const run = (fn: () => Promise<{ error: string | null }>) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (res.error) setError(res.error);
    });

  return (
    <div className={styles.recipients}>
      <span className={styles.recipientsLabel}>{published ? t("failed") : t("alsoSends")}</span>
      {recipients.map((r) => (
        <span key={r.clientId} className={styles.recipientChip}>
          {r.name}
          {!published && (
            <button
              type="button"
              className={styles.recipientRemove}
              onClick={() => run(() => removePlanRecipientAction(kind, planId, r.clientId))}
              disabled={pending}
              aria-label={t("remove", { name: r.name })}
            >
              <CloseIcon />
            </button>
          )}
        </span>
      ))}
      {published && (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => run(() => sendToRemainingRecipientsAction(kind, planId))}
          disabled={pending}
        >
          {pending ? t("sending") : t("resend")}
        </button>
      )}
      {error && <span className={styles.recipientsError}>{error}</span>}
    </div>
  );
}
