import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getMyTrainerBilling } from "@/lib/billing/server";
import { getStripe, isStripeConfigured } from "@/lib/billing/stripe";
import { TIERS, priceIdForTier, type Tier } from "@/lib/billing/plans";
import { intlLocale, type Locale } from "@/lib/i18n/locales";
import styles from "@/app/dashboard/dashboard.module.css";
import b from "../billing.module.css";
import { ChooseTierButton, CheckoutRefresh, ManageButton } from "./PlanActions";

/** Predplatné trénera — tarifa, skúška, využitie klientov, výber tarify (Stripe Checkout), správa (Portal). */

const FEATURE_KEYS: Record<Tier, string[]> = {
  starter: ["clients", "plans", "meals", "dashboard"],
  pro: ["clients", "base", "aiCoach", "aiPlans", "aiMeals", "aiSummaries"],
  business: ["clients", "base", "reports", "branding"],
};

/** Ceny z objektov Price v Stripe (testovacie, kým nie je live režim); chyba = bez ceny, stránka funguje ďalej. */
async function loadPrices(locale: Locale): Promise<Partial<Record<Tier, string>>> {
  if (!isStripeConfigured()) return {};
  const stripe = getStripe();
  const out: Partial<Record<Tier, string>> = {};
  await Promise.all(
    TIERS.map(async (tier) => {
      const id = priceIdForTier(tier);
      if (!id) return;
      try {
        const price = await stripe.prices.retrieve(id);
        if (price.unit_amount == null) return;
        out[tier] = new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: price.currency.toUpperCase() }).format(
          price.unit_amount / 100,
        );
      } catch (err) {
        console.error("predplatne: prices.retrieve", err instanceof Error ? err.message : err);
      }
    }),
  );
  return out;
}

export default async function PredplatnePage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const [{ checkout }, {
    data: { user },
  }, t, locale] = await Promise.all([searchParams, getUser(), getTranslations("billing"), getLocale() as Promise<Locale>]);
  if (!user) redirect("/prihlasenie");

  const [{ state }, prices] = await Promise.all([getMyTrainerBilling(user.id), loadPrices(locale)]);
  const stripeReady = isStripeConfigured();
  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "numeric", year: "numeric" }) : "";

  const statusKey = state.comped ? "comped" : (state.status ?? "none");
  const limitLabel =
    state.clientLimit === null
      ? t("usageUnlimited", { count: state.clientCount })
      : t("usageValue", { count: state.clientCount, limit: state.clientLimit });
  const usagePct = state.clientLimit ? Math.min(100, Math.round((state.clientCount / state.clientLimit) * 100)) : 0;
  const isPaid = !state.comped && (state.status === "active" || state.status === "trialing" || state.status === "past_due");
  // po návrate z platby čakáme na webhook, kým sa stav nezmení na aktívny
  const waitingForWebhook = checkout === "success" && !isPaid;

  return (
    <div className={`${styles.settingsPage} ${b.page}`}>
      <div className={styles.pageHead}>
        <h1>{t("title")}</h1>
        <p>{t("subtitle")}</p>
      </div>

      <CheckoutRefresh active={waitingForWebhook} />
      {checkout === "success" && (
        <div className={`${b.notice} ${b.noticeOk}`} role="status" data-testid="checkout-success">
          {t("checkoutSuccess")}
        </div>
      )}
      {checkout === "cancel" && (
        <div className={b.notice} role="status">
          {t("checkoutCancel")}
        </div>
      )}
      {!stripeReady && !state.comped && (
        <div className={`${b.notice} ${b.noticeError}`} role="status">
          {t("stripeMissing")}
        </div>
      )}
      {state.readOnly && state.reason && (
        <div className={`${b.notice} ${b.noticeError}`} role="status" data-testid="readonly-notice">
          <strong>{t("readOnlyTitle")}.</strong>{" "}
          {t(`banner.readOnly.${state.reason}`, { count: state.clientCount, limit: state.clientLimit ?? 0 })}
        </div>
      )}

      <div className={styles.card} data-testid="billing-summary">
        <h3>{t("currentPlan")}</h3>
        <div className={b.summaryGrid}>
          <div className={b.summaryItem}>
            <span className={b.summaryLabel}>{t("plan")}</span>
            <span className={b.summaryValue}>{state.tier ? t(`tiers.${state.tier}`) : "—"}</span>
          </div>
          <div className={b.summaryItem}>
            <span className={b.summaryLabel}>{t("statusLabel")}</span>
            <span className={b.summaryValue}>{t(`status.${statusKey}`)}</span>
          </div>
          <div className={b.summaryItem}>
            <span className={b.summaryLabel}>{t("usage")}</span>
            <span className={b.summaryValue}>{limitLabel}</span>
            {state.clientLimit ? (
              <div className={b.meter} aria-hidden="true">
                <div className={`${b.meterFill} ${usagePct >= 100 ? b.meterFull : ""}`} style={{ width: `${usagePct}%` }} />
              </div>
            ) : null}
          </div>
        </div>
        {state.comped && <p className={b.summaryNote}>{t("compedNote")}</p>}
        {state.trialDaysLeft !== null && (
          <p className={b.summaryNote} data-testid="trial-left">
            {t("trialLeft", { days: state.trialDaysLeft })} · {t("trialEnds", { date: fmtDate(state.trialEndsAt) })}
          </p>
        )}
        {state.graceDaysLeft !== null && <p className={b.summaryNote}>{t("graceLeft", { days: state.graceDaysLeft })}</p>}
        {isPaid && state.cancelAtPeriodEnd && state.currentPeriodEnd && (
          <p className={b.summaryNote}>{t("cancelsAt", { date: fmtDate(state.currentPeriodEnd) })}</p>
        )}
        {isPaid && !state.cancelAtPeriodEnd && state.currentPeriodEnd && (
          <p className={b.summaryNote}>{t("renews", { date: fmtDate(state.currentPeriodEnd) })}</p>
        )}
      </div>

      {!state.comped && (
        <div className={b.tierGrid}>
          {TIERS.map((tier) => {
            const current = isPaid && state.tier === tier;
            const tierName = t(`tiers.${tier}`);
            return (
              <div key={tier} className={`${b.tierCard} ${current ? b.tierCardCurrent : ""}`} data-testid={`tier-${tier}`}>
                <div className={b.tierHead}>
                  <h3>{tierName}</h3>
                  {current && <span className={b.tierBadge}>{t("currentBadge")}</span>}
                </div>
                <p className={b.tierBlurb}>{t(`tierBlurb.${tier}`)}</p>
                <div className={b.tierPrice}>{prices[tier] ? t("perMonth", { price: prices[tier]! }) : t("priceUnknown")}</div>
                <ul className={b.tierList}>
                  {FEATURE_KEYS[tier].map((k) => (
                    <li key={k}>{t(`features.${tier}.${k}` as never)}</li>
                  ))}
                </ul>
                {current ? null : (
                  <ChooseTierButton
                    tier={tier}
                    tierName={tierName}
                    label={isPaid ? "switchTo" : "choose"}
                    disabled={!stripeReady}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
      {!state.comped && <p className={b.note}>{t("testPriceNote")}</p>}

      {!state.comped && (isPaid || state.status === "canceled" || state.status === "unpaid") && (
        <div className={styles.card}>
          <h3>{t("manage")}</h3>
          <p style={{ color: "var(--paper-dim)", fontSize: 13.5, marginBottom: 14 }}>{t("manageHint")}</p>
          <ManageButton />
        </div>
      )}
    </div>
  );
}
