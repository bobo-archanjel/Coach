"use client";

// Tlačidlá Predplatné: výber tarify (Stripe Checkout), správa (Customer Portal) a krátke
// obnovovanie po návrate z platby. Prístup sa tu NEUDEĽUJE — to robí až webhook; po návrate
// z platby stránka len pár sekúnd sama načítava stav, kým webhook nedorazí.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createCheckoutSessionAction, createPortalSessionAction, type BillingRedirectState } from "./actions";
import type { Variant } from "@/lib/billing/plans";
import pa from "@/app/components/planActions.module.css";
import styles from "../billing.module.css";

function useRedirectAction() {
  const t = useTranslations("billing");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [redirecting, setRedirecting] = useState(false);

  const run = (action: () => Promise<BillingRedirectState>) =>
    startTransition(async () => {
      setError(null);
      const res = await action();
      if (res.error || !res.url) {
        setError(res.error);
        return;
      }
      setRedirecting(true);
      // celé presmerovanie na doménu Stripe (nie <form> POST — CSP form-action 'self')
      window.location.assign(res.url);
    });

  return { error, busy: pending || redirecting, label: redirecting ? t("redirecting") : null, run };
}

export function ChooseTierButton({ variant, tierName, label, disabled }: { variant: Variant; tierName: string; label: "choose" | "switchTo"; disabled?: boolean }) {
  const t = useTranslations("billing");
  const { error, busy, run } = useRedirectAction();
  return (
    <div>
      <button
        type="button"
        className={`${pa.action} ${pa.primary}`}
        style={{ width: "100%" }}
        disabled={busy || disabled}
        onClick={() => run(() => createCheckoutSessionAction(variant))}
        data-testid={`choose-${variant}`}
      >
        {busy ? t("redirecting") : t(label, { tier: tierName })}
      </button>
      {error && (
        <p className={styles.note} role="alert" style={{ color: "var(--danger)", marginTop: 8 }}>
          {error}
        </p>
      )}
    </div>
  );
}

export function ManageButton() {
  const t = useTranslations("billing");
  const { error, busy, run } = useRedirectAction();
  return (
    <div>
      <button type="button" className={`${pa.action} ${pa.inline}`} disabled={busy} onClick={() => run(createPortalSessionAction)} data-testid="manage-subscription">
        {busy ? t("redirecting") : t("manage")}
      </button>
      {error && (
        <p className={styles.note} role="alert" style={{ color: "var(--danger)", marginTop: 8 }}>
          {error}
        </p>
      )}
    </div>
  );
}

/** Po návrate z platby (?checkout=success) každé 3 s načíta stav znova (max. ~30 s), kým webhook nedorazí. */
export function CheckoutRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      router.refresh();
      if (n >= 10) window.clearInterval(id);
    }, 3000);
    return () => window.clearInterval(id);
  }, [active, router]);
  return null;
}
