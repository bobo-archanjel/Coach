import { getTranslations } from "next-intl/server";
import { AppLink as Link } from "@/app/components/AppLink";
import { minTierFor } from "@/lib/billing/plans";
import billing from "@/app/dashboard/billing.module.css";
import rs from "./reports.module.css";

/**
 * Zamknutý náhľad pokročilých reportov (Starter, skúška, vypršaný prístup): jemná karta s
 * ilustračnými stĺpcami a odkazom na Predplatné. Len UX — dáta aj exporty zamyká server
 * (lib/reports/guard.ts), nie táto karta.
 */
export async function ReportsLocked({ variant = "portfolio" }: { variant?: "portfolio" | "client" }) {
  const [t, tb] = await Promise.all([getTranslations("reports.locked"), getTranslations("billing")]);
  const tier = tb(`tiers.${minTierFor("advancedReports")}`);
  return (
    <div className={billing.locked} role="note" data-testid="reports-locked" data-feature="advancedReports">
      <span className={billing.lockIcon} aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="11" width="16" height="9" rx="2.5" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      </span>
      <div className={billing.lockBody} style={{ flex: 1, minWidth: 0 }}>
        <strong>{t(`${variant}.title`, { tier })}</strong>
        <p>{t(`${variant}.text`, { tier })}</p>
        <div className={rs.previewBars} aria-hidden="true">
          {[34, 52, 44, 70, 62, 88, 76].map((h, i) => (
            <span key={i} style={{ height: `${h}%` }} />
          ))}
        </div>
        <Link href="/dashboard/predplatne" className={billing.lockLink}>
          {t("upgrade")}
        </Link>
      </div>
    </div>
  );
}
