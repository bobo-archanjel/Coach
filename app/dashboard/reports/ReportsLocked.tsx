import { getTranslations } from "next-intl/server";
import { minTierFor } from "@/lib/billing/plans";
import { LockedNotice } from "@/app/dashboard/LockedFeature";

/**
 * Zamknutý náhľad pokročilých reportov (Starter, skúška, vypršaný prístup): jemná karta s
 * odkazom na Predplatné. Len UX — dáta aj exporty zamyká server (lib/reports/guard.ts), nie táto karta.
 */
export async function ReportsLocked({ variant = "portfolio" }: { variant?: "portfolio" | "client" }) {
  const [t, tb] = await Promise.all([getTranslations("reports.locked"), getTranslations("billing")]);
  const tier = tb(`tiers.${minTierFor("advancedReports")}`);
  return <LockedNotice testId="reports-locked" feature="advancedReports" title={t(`${variant}.title`, { tier })} text={t(`${variant}.text`, { tier })} linkLabel={t("upgrade")} />;
}
