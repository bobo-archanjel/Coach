"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LogoMark } from "../../components/LogoMark";
import { createClient } from "@/lib/supabase/client";
import { checkPassword } from "@/lib/passwordStrength";
import styles from "../auth.module.css";

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

const EyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M1.5 9S4.5 3.5 9 3.5 16.5 9 16.5 9 13.5 14.5 9 14.5 1.5 9 1.5 9Z" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="9" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

type LinkState = "checking" | "ready" | "invalid";

/**
 * Cieľ odkazu z e-mailu "Zabudnuté heslo" (app/prihlasenie → resetPasswordForEmail).
 * Supabase JS klient pri načítaní tejto stránky sám spracuje recovery token z URL
 * hashu a vytvorí dočasnú session — signalizuje to udalosťou PASSWORD_RECOVERY.
 * Ak sa nič nespracuje (link expirovaný/neplatný, alebo stránka otvorená priamo
 * bez tokenu), po krátkom čakaní ukážeme "invalid" stav namiesto formulára.
 */
export function NewPasswordView() {
  const router = useRouter();
  const t = useTranslations("auth");
  const tp = useTranslations("password");
  const [supabase] = useState(() => createClient());
  const [linkState, setLinkState] = useState<LinkState>("checking");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let active = true;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY") setLinkState("ready");
    });

    // Poistka pre prípad, že event stihol prebehnúť pred pripojením listenera.
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (data.session) {
        setLinkState("ready");
        return;
      }
      window.setTimeout(async () => {
        if (!active) return;
        const { data: retry } = await supabase.auth.getSession();
        if (active) setLinkState(retry.session ? "ready" : "invalid");
      }, 1200);
    };
    check();

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;
    const confirm = (form.elements.namedItem("confirm") as HTMLInputElement).value;

    const pwCheck = checkPassword(password);
    if (!pwCheck.ok) {
      setError(tp(`issue.${pwCheck.issues[0]}`));
      return;
    }
    if (password !== confirm) {
      setError(t("mismatch"));
      return;
    }

    setStatus("loading");
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setStatus("idle");
      setError(updateError.message);
      return;
    }

    setStatus("success");
    setTimeout(() => {
      router.push("/prihlasenie");
    }, 1600);
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.brandPanel}>
        <div className={styles.plateField} aria-hidden="true" />
        <div>
          <Link className={styles.brand} href="/">
            <LogoMark className={styles.logoMark} />
            FitPilot
          </Link>
          <p className={styles.brandTagline}>{t("tagline")}</p>
        </div>
      </aside>

      <main className={styles.formPanel}>
        <div className={styles.authCard}>
          {linkState === "checking" && (
            <div className={styles.authHead}>
              <h2>{t("checkingLink")}</h2>
              <p>{t("pleaseWait")}</p>
            </div>
          )}

          {linkState === "invalid" && (
            <>
              <div className={styles.authHead}>
                <h2>{t("linkInvalidTitle")}</h2>
                <p>{t("linkInvalidText")}</p>
              </div>
              <Link href="/prihlasenie" className={styles.btnSubmit} style={{ textDecoration: "none" }}>
                {t("backToLoginPlain")}
              </Link>
            </>
          )}

          {linkState === "ready" && (
            <>
              <div className={styles.authHead}>
                <h2>{t("newTitle")}</h2>
                <p>{t("newSub")}</p>
              </div>

              <form ref={formRef} noValidate onSubmit={handleSubmit}>
                <div className={`${styles.field} ${styles.hasToggle}`}>
                  <label htmlFor="new-password">{t("newPassword")}</label>
                  <div className={styles.inputWrap}>
                    <input
                      id="new-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder={t("passwordPlaceholder")}
                      autoComplete="new-password"
                      required
                      minLength={8}
                    />
                    <button
                      type="button"
                      className={styles.toggleVisibility}
                      aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      <EyeIcon />
                    </button>
                  </div>
                </div>

                <div className={styles.field}>
                  <label htmlFor="confirm-password">{t("newConfirm")}</label>
                  <input
                    id="confirm-password"
                    name="confirm"
                    type={showPassword ? "text" : "password"}
                    placeholder={t("passwordPlaceholder")}
                    autoComplete="new-password"
                    required
                    minLength={8}
                  />
                </div>

                <button
                  type="submit"
                  className={`${styles.btnSubmit} ${status === "success" ? styles.success : ""}`}
                  disabled={status === "loading"}
                >
                  {status === "loading" && <span className={styles.spinner} aria-hidden="true" />}
                  <span>{status === "loading" ? t("saving") : t("newSubmit")}</span>
                </button>

                {status === "success" && (
                  <div className={styles.formStatus} role="status">
                    <SuccessIcon />
                    {t("newDone")}
                  </div>
                )}
                {error && (
                  <div className={`${styles.formStatus} ${styles.error}`} role="alert">
                    <ErrorIcon />
                    {error}
                  </div>
                )}
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
