"use client";

import { useState, useTransition } from "react";
import { generateRosterSummaryAction } from "./actions";
import { InfoTip } from "@/app/components/InfoTip";
import dashboardModule from "../dashboard.module.css";
import { useSkinStyles } from "@/app/components/uiSkin";

/**
 * AI týždenný digest portfólia (feature/analytika-v2, bod 5) — on-demand tlačidlo,
 * žiadny cron. `pending` zablokuje tlačidlo počas volania (opakovaný klik nevytvorí
 * druhé súbežné volanie Claude); server action má navyše vlastný denný rate-limit
 * per tréner (lib/ai/rateLimit.ts). Rovnaký UX vzor ako ProgressSummaryCard na
 * detaile klienta (tam `useActionState` + `<form>`; tu akcia bez vstupu, takže
 * `useTransition` + priame volanie).
 *
 * `previewSummary` (len DEV `?preview=ok`) zobrazí ukážkový text bez volania AI —
 * server action sa v preview nedá spustiť (žiadna session).
 */
export function RosterSummaryCard({ previewSummary }: { previewSummary?: string | null }) {
  const styles = useSkinStyles("dashboard", dashboardModule);
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    startTransition(async () => {
      const result = await generateRosterSummaryAction();
      setSummary(result.summary);
      setError(result.error);
    });
  }

  const shownSummary = previewSummary ?? summary;

  return (
    <div className={styles.card} style={{ marginBottom: 20 }}>
      <h3>
        AI zhrnutie portfólia{" "}
        <InfoTip title="AI zhrnutie portfólia">
          Krátky týždenný prehľad — na koho sa tento týždeň zamerať a prečo. Appka spočíta čísla, AI ich len sformuluje.
        </InfoTip>
      </h3>

      {!previewSummary && (
        <button type="button" onClick={run} className="btn btn-ghost btn-sm" disabled={pending}>
          {pending ? "Generujem…" : "Zhrnúť týždeň"}
        </button>
      )}

      {error && (
        <p className={styles.noWorkouts} style={{ marginTop: 10 }}>
          {error}
        </p>
      )}

      {shownSummary && (
        <p className={styles.infoValue} style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
          {shownSummary}
        </p>
      )}
    </div>
  );
}
