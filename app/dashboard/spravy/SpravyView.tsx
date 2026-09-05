"use client";

import { useState, type ReactNode } from "react";
import { BulkMessageForm } from "./BulkMessageForm";
import styles from "../dashboard.module.css";

/**
 * Prepínač medzi normálnou schránkou (1:1 vlákna) a hromadnou správou (viacerým
 * klientom naraz) — čisto klientský toggle, žiadna zmena URL/navigácia, nech sa
 * dá kedykoľvek prepnúť späť bez straty rozpísanej správy alebo výberu vlákna.
 */
export function SpravyView({ inboxContent, clients }: { inboxContent: ReactNode; clients: { id: string; full_name: string }[] }) {
  const [bulk, setBulk] = useState(false);

  return (
    <>
      <div className={styles.spravyModeToggle}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBulk((b) => !b)}>
          {bulk ? "← Späť na schránku" : "Hromadná správa"}
        </button>
      </div>

      {bulk ? (
        <div className={styles.card}>
          <h3>Hromadná správa</h3>
          <BulkMessageForm clients={clients} />
        </div>
      ) : (
        inboxContent
      )}
    </>
  );
}
