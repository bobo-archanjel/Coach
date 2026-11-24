import { getLocale, getTranslations } from "next-intl/server";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import { AppLink as Link } from "../components/AppLink";
import { TRIAL_WARN_DAYS, type BillingState } from "@/lib/billing/entitlements";
import styles from "./billing.module.css";

/**
 * Globálny pruh v dashboarde (feature/Stripe): blížiaci sa koniec skúšky, read-only režim
 * (skúška skončila / zrušené / nezaplatené / nad limitom tarify) a odklad po zlyhanej platbe.
 * Komped účty a bežné aktívne predplatné nič nezobrazia.
 */
export async function BillingBanner({ state }: { state: BillingState }) {
  const [t, locale] = await Promise.all([getTranslations("billing"), getLocale() as Promise<Locale>]);

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
  } else if (state.scheduledChange?.overLimit) {
    // downgrade ešte nenastal — účet je zatiaľ plnohodnotný, ale po prechode bude nad limitom
    const sc = state.scheduledChange;
    tone = "warn";
    title = t("banner.title.scheduledOverLimit");
    text = t("banner.scheduledOverLimit", {
      plan: sc.tier === "starter" && sc.clientLimit !== null ? `${t(`tiers.${sc.tier}`)} ${sc.clientLimit}` : t(`tiers.${sc.tier}`),
      date: new Date(sc.at).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "numeric", year: "numeric" }),
      count: state.clientCount,
      limit: sc.clientLimit ?? 0,
    });
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
