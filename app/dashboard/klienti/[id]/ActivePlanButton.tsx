"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setClientActivePlanAction } from "../actions";
import styles from "../../dashboard.module.css";
import pa from "@/app/components/planActions.module.css";
import { ActionActivateIcon } from "@/app/components/ActionIcons";

/**
 * „Nastaviť ako aktívny“ pri zverejnenom pláne v detaile klienta — plán sa klientovi
 * ukáže na karte Dnes (0056). Po úspechu revalidácia prekreslí zoznam s odznakom „Aktívny“.
 */
export function ActivePlanButton({
  clientId,
  planId,
  planName,
  wide = false,
}: {
  clientId: string;
  planId: string;
  planName: string;
  /** tenké tlačidlo cez celú šírku (karta plánu v detaile klienta) */
  wide?: boolean;
}) {
  const t = useTranslations("clientDetail.activePlan");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const setActive = () => {
    setError(null);
    startTransition(async () => {
      const res = await setClientActivePlanAction(clientId, planId);
      if (res.error) setError(res.error);
    });
  };

  return (
    <span className={`${styles.activePlanAction} ${wide ? styles.activePlanWide : ""}`}>
      <button
        type="button"
        className={wide ? `${pa.action} ${pa.wide}` : `${pa.action} ${pa.small} ${pa.inline}`}
        onClick={setActive}
        disabled={pending}
        aria-label={t("aria", { name: planName })}
      >
        <ActionActivateIcon />
        {pending ? t("setting") : t("set")}
      </button>
      {error && (
        <span className={styles.publishError} role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
