"use client";

// Overenie e-mailu kódom (feature/overenie-kodom) — po registrácii a po prihlásení
// s neovereným e-mailom. Supabase pošle 6-miestny kód (šablóna „Confirm signup“
// s {{ .Token }}), používateľ ho zadá tu, server ho overí a rovno prihlási.
// Jedno pole (nie 6 políčok): autoComplete="one-time-code" (iOS/Android ponúknu kód
// zo SMS/mailu), vloženie celého kódu aj s medzerami, odoslanie hneď po 6. číslici.

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { isCompleteSignupCode, normalizeSignupCode, SIGNUP_CODE_LENGTH } from "@/lib/auth/signupCode";
import { resendSignupCodeAction, verifySignupCodeAction } from "./actions";
import styles from "./auth.module.css";

/** pauza medzi poslaniami kódu — Supabase aj tak pustí najviac jeden e-mail za minútu */
export const RESEND_COOLDOWN = 60;

const ErrorIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="7" r="6" stroke="var(--error)" strokeWidth="1.4" />
    <path d="M7 4v3.5M7 9.6v.1" stroke="var(--error)" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);
const SuccessIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M3 8.5l3 3 7-7" stroke="#a9d3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const MailIcon = () => (
  <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
    <rect x="3" y="6" width="20" height="14" rx="3.5" stroke="currentColor" strokeWidth="1.8" />
    <path d="M4.5 8l8.5 6 8.5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function VerifyCodeStep({
  email,
  mode,
  initialCooldown = RESEND_COOLDOWN,
  preview = false,
  onResent,
  onVerified,
  onChangeEmail,
}: {
  email: string;
  /** „register“ = práve sa zaregistroval, „login“ = prihlásenie s neovereným e-mailom */
  mode: "register" | "login";
  initialCooldown?: number;
  /** DEV náhľad — bez servera: kód 123456 je správny, nový kód sa „pošle“ len naoko */
  preview?: boolean;
  onResent?: () => void;
  onVerified: (redirectTo: string) => void;
  onChangeEmail: () => void;
}) {
  const t = useTranslations("auth.verify");
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const [error, setError] = useState<string | null>(null);
  // posledný odoslaný kód — automatické odoslanie ten istý zlý kód neposiela dookola
  const lastSubmitted = useRef<string | null>(null);

  const [cooldown, setCooldown] = useState(initialCooldown);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function submit(value: string) {
    if (status !== "idle") return;
    if (!isCompleteSignupCode(value)) {
      setError(t("codeIncomplete"));
      inputRef.current?.focus();
      return;
    }
    lastSubmitted.current = value;
    setError(null);
    setResent(false);
    setStatus("loading");
    const res = preview
      ? await new Promise<{ error: string | null; redirectTo: string | null }>((r) =>
          setTimeout(() => r(value === "123456" ? { error: null, redirectTo: "" } : { error: t("codeInvalid"), redirectTo: null }), 400),
        )
      : await verifySignupCodeAction(email, value).catch(() => ({ error: t("codeInvalid"), redirectTo: null }));
    if (res.error || res.redirectTo === null) {
      setStatus("idle");
      setError(res.error ?? t("codeInvalid"));
      // označený kód sa prepíše hneď ďalším písaním / vložením
      requestAnimationFrame(() => inputRef.current?.select());
      return;
    }
    setStatus("success");
    onVerified(res.redirectTo);
  }

  function handleChange(raw: string) {
    const next = normalizeSignupCode(raw);
    setCode(next);
    if (error && next.length < SIGNUP_CODE_LENGTH) setError(null);
    if (isCompleteSignupCode(next) && next !== lastSubmitted.current) void submit(next);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void submit(code);
  }

  async function handleResend() {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError(null);
    setResent(false);
    const res = preview
      ? { error: null, cooldown: RESEND_COOLDOWN }
      : await resendSignupCodeAction(email).catch(() => ({ error: t("resendFailed"), cooldown: 0 }));
    setResending(false);
    setCooldown(res.cooldown);
    if (res.error) {
      setError(res.error);
      return;
    }
    setResent(true);
    setCode("");
    lastSubmitted.current = null;
    onResent?.();
    inputRef.current?.focus();
  }

  const busy = status !== "idle";

  return (
    <section id="panel-verify" aria-labelledby="verify-title" data-testid="verify-step">
      <div className={styles.verifyIcon}>
        <MailIcon />
      </div>
      <div className={`${styles.authHead} ${styles.verifyHead}`}>
        <h2 id="verify-title">{t("title")}</h2>
        <p>
          {t.rich(mode === "login" ? "loginSub" : "sub", {
            email,
            b: (chunks) => <strong className={styles.verifyEmail}>{chunks}</strong>,
          })}
        </p>
      </div>

      <form noValidate onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label htmlFor="verify-code">{t("codeLabel")}</label>
          <input
            ref={inputRef}
            id="verify-code"
            name="code"
            className={styles.codeInput}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={SIGNUP_CODE_LENGTH + 6}
            placeholder={"•".repeat(SIGNUP_CODE_LENGTH)}
            autoFocus
            value={code}
            disabled={busy}
            aria-invalid={Boolean(error) && !resent}
            aria-describedby={error ? "verify-error" : undefined}
            onChange={(e) => handleChange(e.currentTarget.value)}
          />
        </div>

        <button
          type="submit"
          className={`${styles.btnSubmit} ${status === "success" ? styles.success : ""}`}
          disabled={busy || code.length < SIGNUP_CODE_LENGTH}
        >
          {status === "loading" && <span className={styles.spinner} aria-hidden="true" />}
          <span>{status === "loading" ? t("verifying") : status === "success" ? t("verified") : t("submit")}</span>
        </button>

        {error && (
          <div id="verify-error" className={`${styles.formStatus} ${styles.error}`} role="alert">
            <ErrorIcon />
            {error}
          </div>
        )}
        {resent && !error && (
          <div className={styles.formStatus} role="status">
            <SuccessIcon />
            {t("resent")}
          </div>
        )}
      </form>

      <div className={styles.verifyActions}>
        <button
          type="button"
          className={styles.link}
          onClick={handleResend}
          disabled={cooldown > 0 || resending || status === "success"}
        >
          {cooldown > 0 ? t("resendIn", { seconds: cooldown }) : t("resend")}
        </button>
        <span aria-hidden="true">·</span>
        <button type="button" className={styles.link} onClick={onChangeEmail} disabled={status === "success"}>
          {t("changeEmail")}
        </button>
      </div>
      <p className={styles.verifyHint}>{t("spam")}</p>
    </section>
  );
}
