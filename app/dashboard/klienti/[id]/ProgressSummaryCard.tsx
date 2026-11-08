"use client";

import { useActionState } from "react";
import { generateProgressSummaryAction, type ProgressSummaryState } from "../actions";
import { InfoTip } from "@/app/components/InfoTip";
import styles from "../../dashboard.module.css";

const initialState: ProgressSummaryState = { summary: null, error: null };

/**
 * AI sumarizácia progresu — on-demand tlačidlo v Analytike (žiadny cron).
 * `pending` zablokuje tlačidlo počas volania, nech opakovaný klik/dvojklik
 * nevytvorí druhé súbežné (a plytvajúce) volanie Claude — server action má
 * navyše vlastný denný rate-limit (lib/ai/rateLimit.ts) pre prípad viacerých kariet/tabov.
 */
export function ProgressSummaryCard({ clientId }: { clientId: string }) {
  const [state, formAction, pending] = useActionState(generateProgressSummaryAction, initialState);

  return (
    <div className={styles.card}>
      <h3>
        AI zhrnutie progresu{" "}
        <InfoTip title="AI zhrnutie progresu">
          Krátke zhrnutie adherencie, váhy a sily za posledné dni — appka spočíta čísla, AI ich len sformuluje.
        </InfoTip>
      </h3>

      <form action={formAction}>
        <input type="hidden" name="client_id" value={clientId} />
        <button type="submit" className="btn btn-ghost btn-sm" disabled={pending}>
          {pending ? "Generujem…" : "Zhrnúť progres"}
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
