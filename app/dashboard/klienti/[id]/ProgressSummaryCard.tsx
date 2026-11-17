"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { generateProgressSummaryAction, type ProgressSummaryState } from "../actions";
import { InfoTip } from "@/app/components/InfoTip";
import styles from "../../dashboard.module.css";
import pa from "@/app/components/planActions.module.css";
import { ActionSparkIcon } from "@/app/components/ActionIcons";

const initialState: ProgressSummaryState = { summary: null, error: null };

/**
 * AI sumarizácia progresu — on-demand tlačidlo v Analytike (žiadny cron).
 * `pending` zablokuje tlačidlo počas volania, nech opakovaný klik/dvojklik
 * nevytvorí druhé súbežné (a plytvajúce) volanie Claude — server action má
 * navyše vlastný denný rate-limit (lib/ai/rateLimit.ts) pre prípad viacerých kariet/tabov.
 */
export function ProgressSummaryCard({ clientId }: { clientId: string }) {
  const [state, formAction, pending] = useActionState(generateProgressSummaryAction, initialState);
  const t = useTranslations("clientDetail.aiSummary");

  return (
    <div className={styles.card}>
      <h3>
        {t("title")} <InfoTip title={t("title")}>{t("tip")}</InfoTip>
      </h3>

      <form action={formAction}>
        <input type="hidden" name="client_id" value={clientId} />
        <button type="submit" className={`${pa.action} ${pa.small} ${pa.inline}`} disabled={pending}>
          <ActionSparkIcon />
          {pending ? t("generating") : t("generate")}
        </button>
      </form>

      {state.error && (
        <p className={styles.noWorkouts} style={{ marginTop: 10 }}>
          {state.error}
        </p>
      )}

      {state.summary && (
        <p className={styles.infoValue} style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
          {state.summary}
        </p>
      )}
    </div>
  );
}
