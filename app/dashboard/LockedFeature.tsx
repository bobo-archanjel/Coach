"use client";

// Zamknutá funkcia (AI nástroje, pridanie klienta nad limit) — jemná karta s odkazom na
// Predplatné namiesto samotného ovládacieho prvku. Zobrazenie len pre UX, server odmietne aj tak.

import { useTranslations } from "next-intl";
import { AppLink as Link } from "../components/AppLink";
import { minTierFor, type Feature } from "@/lib/billing/plans";
import { useBilling } from "./BillingContext";
import styles from "./billing.module.css";

/** Odznak „od PRO“ (napr. pri nadpise sekcie). */
export function TierBadge({ feature }: { feature: Feature }) {
  const t = useTranslations("billing");
  const tier = minTierFor(feature);
  return <span className={styles.tierBadge}>{t("lock.badge", { tier: t(`tiers.${tier}`) })}</span>;
}

/**
 * Obal okolo funkcie: ak ju tarifa odomyká, vykreslí deti; inak kartu s vysvetlením a CTA.
 * Pri read-only účte (vypršaná skúška, nezaplatené, nad limitom) je text o obnove predplatného.
 */
export function FeatureGate({ feature, children }: { feature: Feature; children: React.ReactNode }) {
  const t = useTranslations("billing");
  const billing = useBilling();
  if (billing.features[feature]) return <>{children}</>;

  const tier = t(`tiers.${minTierFor(feature)}`);
  return (
    <div className={styles.locked} role="note" data-testid="feature-locked" data-feature={feature}>
      <span className={styles.lockIcon} aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="11" width="16" height="9" rx="2.5" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      </span>
      <div className={styles.lockBody}>
        <strong>{billing.readOnly ? t("lock.readOnly") : t("lock.aiTitle", { tier })}</strong>
        {!billing.readOnly && <p>{t("lock.aiText", { tier })}</p>}
        <Link href="/dashboard/predplatne" className={styles.lockLink}>
          {t("lock.upgrade")}
        </Link>
      </div>
    </div>
  );
}

/** Karta namiesto formulára na pridanie klienta, keď ho tarifa/read-only nepustí. */
export function ClientLimitNotice() {
  const t = useTranslations("billing");
  const billing = useBilling();
  return (
    <div className={styles.locked} role="note" data-testid="client-limit-locked">
      <span className={styles.lockIcon} aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="11" width="16" height="9" rx="2.5" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      </span>
      <div className={styles.lockBody}>
        <strong>
          {billing.readOnly ? t("lock.addClientReadOnly") : t("lock.clientLimit", { limit: billing.clientLimit ?? 0 })}
        </strong>
        <Link href="/dashboard/predplatne" className={styles.lockLink}>
          {t("lock.upgrade")}
        </Link>
      </div>
    </div>
  );
}
