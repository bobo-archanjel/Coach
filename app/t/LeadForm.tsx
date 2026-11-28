"use client";

// Formulár „Chcem trénovať s tebou“ na verejnej stránke trénera. Zobrazenie a pohodlie — všetko
// (validáciu, Turnstile, limity, zápis) znova overuje server (app/t/[handle]/actions.ts).
// Honeypot `hp` je skryté pole (mimo obrazovky, tabIndex -1, autocomplete off) — človek ho nevyplní.

import { startTransition, useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { TurnstileScript, useTurnstile } from "@/app/components/Turnstile";
import { LEAD_EXPERIENCE, LEAD_GOALS, LEAD_LIMITS_TEXT } from "@/lib/publicPage/leads";
import { charLength } from "@/lib/branding/validation";
import { submitLeadAction, type LeadFormState } from "./[handle]/actions";
import styles from "./leadForm.module.css";

const initial: LeadFormState = { error: null, sent: false };

export function LeadForm({ handle, disabled = false, privacyHref }: { handle: string; disabled?: boolean; privacyHref: string }) {
  const t = useTranslations("publicPage.lead");
  const [state, formAction, pending] = useActionState(submitLeadAction, initial);
  const [message, setMessage] = useState("");
  const turnstile = useTurnstile();

  if (state.sent) {
    return (
      <p className={styles.success} role="status" data-testid="lead-success">
        <svg className={styles.successIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="m8 12.4 2.6 2.6L16 9.6" />
        </svg>
        <span>{t("success")}</span>
      </p>
    );
  }

  // token Turnstile sa pridá až pri odoslaní (je jednorazový a vypršanie rieši widget sám)
  async function submit(formData: FormData) {
    formData.set("turnstile", await turnstile.waitForToken(6_000));
    // po await sme mimo prechodu akcie formulára — dispatch useActionState musí ísť cez startTransition
    startTransition(() => formAction(formData));
    turnstile.reset();
  }

  return (
    <>
      <p className={styles.formIntro}>{t("intro")}</p>
      {disabled && <p className={styles.note}>{t("previewNote")}</p>}
      {!disabled && <TurnstileScript />}
      <form action={submit} className={`${styles.form} ${disabled ? styles.formDisabled : ""}`} data-testid="lead-form" noValidate={false}>
        <input type="hidden" name="handle" value={handle} />
        <div className={styles.trap} aria-hidden="true">
          <label>
            Web
            <input type="text" name="hp" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="lead-name">
            {t("name")}
          </label>
          <input id="lead-name" name="name" className={styles.input} required minLength={LEAD_LIMITS_TEXT.nameMin} maxLength={LEAD_LIMITS_TEXT.nameMax} autoComplete="name" disabled={disabled} />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="lead-email">
            {t("email")}
          </label>
          <input id="lead-email" name="email" type="email" className={styles.input} required maxLength={254} autoComplete="email" inputMode="email" spellCheck={false} disabled={disabled} />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="lead-phone">
            {t("phone")} <span className={styles.opt}>{t("optional")}</span>
          </label>
          <input id="lead-phone" name="phone" type="tel" className={styles.input} maxLength={LEAD_LIMITS_TEXT.phoneMax} autoComplete="tel" inputMode="tel" disabled={disabled} />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="lead-goal">
            {t("goal")}
          </label>
          <select id="lead-goal" name="goal" className={styles.select} required defaultValue="" disabled={disabled}>
            <option value="" disabled>
              {t("goalPlaceholder")}
            </option>
            {LEAD_GOALS.map((g) => (
              <option key={g} value={g}>
                {t(`goals.${g}`)}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="lead-exp">
            {t("experience")}
          </label>
          <select id="lead-exp" name="experience" className={styles.select} required defaultValue="" disabled={disabled}>
            <option value="" disabled>
              {t("experiencePlaceholder")}
            </option>
            {LEAD_EXPERIENCE.map((e) => (
              <option key={e} value={e}>
                {t(`experiences.${e}`)}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="lead-avail">
            {t("availability")} <span className={styles.opt}>{t("optional")}</span>
          </label>
          <input id="lead-avail" name="availability" className={styles.input} maxLength={LEAD_LIMITS_TEXT.availabilityMax} placeholder={t("availabilityPlaceholder")} disabled={disabled} />
        </div>
        <div className={`${styles.field} ${styles.span2}`}>
          <label className={styles.label} htmlFor="lead-message">
            {t("message")} <span className={styles.opt}>{t("optional")}</span>
          </label>
          <textarea
            id="lead-message"
            name="message"
            className={styles.textarea}
            maxLength={LEAD_LIMITS_TEXT.messageMax}
            placeholder={t("messagePlaceholder")}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-describedby="lead-count"
            disabled={disabled}
          />
          <span id="lead-count" className={styles.count}>
            {charLength(message)} / {LEAD_LIMITS_TEXT.messageMax}
          </span>
        </div>

        <label className={`${styles.consent} ${styles.span2}`}>
          <input type="checkbox" name="consent" value="1" required disabled={disabled} />
          <span>
            {t("consent")}{" "}
            <a href={privacyHref} className={styles.privacy} target="_blank" rel="noopener">
              {t("privacyLink")}
            </a>
          </span>
        </label>

        {!disabled && <div ref={turnstile.containerRef} className={`${styles.captcha} ${styles.span2}`} />}

        {state.error && (
          <p className={`${styles.error} ${styles.span2}`} role="alert" data-testid="lead-error">
            {state.error}
          </p>
        )}

        <div className={styles.span2}>
          <button type="submit" className={styles.submit} disabled={pending || disabled} data-testid="lead-submit">
            {pending ? t("sending") : t("submit")}
          </button>
        </div>
      </form>
    </>
  );
}
