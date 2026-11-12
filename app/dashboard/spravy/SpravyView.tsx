"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { BulkMessageForm } from "./BulkMessageForm";
import styles from "../dashboard.module.css";

/**
 * Prepínač medzi normálnou schránkou (1:1 vlákna) a hromadnou správou (viacerým
 * klientom naraz) — čisto klientský toggle, žiadna zmena URL/navigácia, nech sa
 * dá kedykoľvek prepnúť späť bez straty rozpísanej správy alebo výberu vlákna.
 */
export function SpravyView({
  inboxContent,
  clients,
}: {
  inboxContent: ReactNode;
  clients: { id: string; full_name: string }[];
}) {
  const t = useTranslations("inbox");
  const [bulk, setBulk] = useState(false);

  return (
    <>
      {/* hideOnThreadMobile: skryté len kým je otvorené vlákno (CSS :has na .inboxGrid) —
          v režime hromadnej správy .inboxGrid v DOM nie je, prepínač ostáva viditeľný. */}
      <div className={`${styles.spravyModeToggle} ${styles.hideOnThreadMobile}`}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBulk((b) => !b)}>
          {bulk ? t("backToInbox") : t("bulk")}
        </button>
      </div>

      {bulk ? (
        <div className={styles.card}>
          <h3>{t("bulk")}</h3>
          <BulkMessageForm clients={clients} />
        </div>
      ) : (
        inboxContent
      )}
    </>
  );
}
