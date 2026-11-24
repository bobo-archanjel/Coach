import { getTranslations } from "next-intl/server";
import { AppLink as Link } from "../components/AppLink";
import { TRIAL_WARN_DAYS, type BillingState } from "@/lib/billing/entitlements";
import styles from "./billing.module.css";

/**
 * Globálny pruh v dashboarde (feature/Stripe): blížiaci sa koniec skúšky, read-only režim
 * (skúška skončila / zrušené / nezaplatené / nad limitom tarify) a odklad po zlyhanej platbe.
 * Komped účty a bežné aktívne predplatné nič nezobrazia.
 */
export async function BillingBanner({ state }: { state: BillingState }) {
  const t = await getTranslations("billing");

  let tone: "warn" | "alert" | null = null;
  let title = "";
  let text = "";

  if (state.readOnly && state.reason) {
    tone = "alert";
    title = t("banner.title.readOnly");
    text = t(`banner.readOnly.${state.reason}`, { count: state.clientCount, limit: state.clientLimit ?? 0 });
  } else if (state.status === "past_due" && state.graceDaysLeft !== null) {
    tone = "warn";
    title = t("banner.title.pastDue");
    text = t("banner.pastDue", { graceText: t("graceLeft", { days: state.graceDaysLeft }) });
  } else if (state.trialDaysLeft !== null && state.trialDaysLeft <= TRIAL_WARN_DAYS && state.accessTier) {
    tone = "warn";
    title = t("banner.title.trialEnding");
    text = t("banner.trialEnding", { days: state.trialDaysLeft });
  }
  if (!tone) return null;

  return (
    <div className={`${styles.banner} ${tone === "alert" ? styles.bannerAlert : styles.bannerWarn}`} role="status" data-testid="billing-banner" data-tone={tone}>
      <div className={styles.bannerText}>
        <strong>{title}</strong>
        <span>{text}</span>
      </div>
      <Link href="/dashboard/predplatne" className={styles.bannerCta}>
        {t("banner.cta")}
      </Link>
    </div>
  );
}
