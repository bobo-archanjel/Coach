"use client";

// Zmena hesla priamo z Nastavení (Dashboard) / Profilu (Portál) — na rozdiel od
// "Zabudnuté heslo" (e-mailový odkaz, bez prihlásenia) tu je používateľ už
// prihlásený. Napriek platnej session si vyžiadame súčasné heslo pred zmenou
// (overené cez signInWithPassword) — ochrana proti zmene hesla cez ukradnutú/
// odloženú session bez znalosti pôvodného hesla (rovnaký dôvod ako re-auth
// pri citlivých akciách inde v appke).
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { checkPassword } from "@/lib/passwordStrength";
import { PasswordRequirements } from "./PasswordRequirements";
import styles from "./ChangePasswordForm.module.css";

const ErrorIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="7" r="6" stroke="var(--error)" strokeWidth="1.4" />
    <path d="M7 4v3.5M7 9.6v.1" stroke="var(--error)" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);
const SuccessIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M3 8.5l3 3 7-7" stroke="var(--moss)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const EyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M1.5 9S4.5 3.5 9 3.5 16.5 9 16.5 9 13.5 14.5 9 14.5 1.5 9 1.5 9Z" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="9" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

export function ChangePasswordForm({ email }: { email: string }) {
  const [supabase] = useState(() => createClient());
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const current = (form.elements.namedItem("current") as HTMLInputElement).value;
    const next = (form.elements.namedItem("next") as HTMLInputElement).value;
    const confirm = (form.elements.namedItem("confirm") as HTMLInputElement).value;

    if (!current) {
      setError("Zadaj súčasné heslo.");
      return;
    }
    const emailLocalPart = email.split("@")[0] ?? "";
    const pwCheck = checkPassword(next, [emailLocalPart]);
    if (!pwCheck.ok) {
      setError(pwCheck.issues[0]);
      return;
    }
    if (next !== confirm) {
      setError("Nové heslá sa nezhodujú.");
      return;
    }
    if (next === current) {
      setError("Nové heslo musí byť iné ako súčasné.");
      return;
    }

    setStatus("loading");
    const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password: current });
    if (reauthError) {
      setStatus("idle");
      setError("Súčasné heslo nie je správne.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: next });
    if (updateError) {
      setStatus("idle");
      setError("Zmenu hesla sa nepodarilo uložiť. Skús to prosím znova.");
      return;
    }

    setStatus("success");
    setNewPassword("");
    form.reset();
  }

  return (
    <form className={styles.form} noValidate onSubmit={handleSubmit}>
      <div className={`${styles.field} ${styles.hasToggle}`}>
        <label htmlFor="cp-current">Súčasné heslo</label>
        <div className={styles.inputWrap}>
          <input
            id="cp-current"
            name="current"
            type={showCurrent ? "text" : "password"}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            className={styles.toggleVisibility}
            aria-label={showCurrent ? "Skryť heslo" : "Zobraziť heslo"}
            onClick={() => setShowCurrent((v) => !v)}
          >
            <EyeIcon />
          </button>
        </div>
      </div>

      <div className={`${styles.field} ${styles.hasToggle}`}>
        <label htmlFor="cp-next">Nové heslo</label>
        <div className={styles.inputWrap}>
          <input
            id="cp-next"
            name="next"
            type={showNew ? "text" : "password"}
            placeholder="min. 8 znakov"
            autoComplete="new-password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.currentTarget.value)}
          />
          <button
            type="button"
            className={styles.toggleVisibility}
            aria-label={showNew ? "Skryť heslo" : "Zobraziť heslo"}
            onClick={() => setShowNew((v) => !v)}
          >
            <EyeIcon />
          </button>
        </div>
        {newPassword ? (
          <PasswordRequirements password={newPassword} />
        ) : (
          <span className={styles.fieldHint}>Aspoň 8 znakov, kombinuj písmená aj čísla.</span>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="cp-confirm">Zopakuj nové heslo</label>
        <input
          id="cp-confirm"
          name="confirm"
          type={showNew ? "text" : "password"}
          placeholder="min. 8 znakov"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </div>

      <button type="submit" className={styles.btnSubmit} disabled={status === "loading"}>
        {status === "loading" && <span className={styles.spinner} aria-hidden="true" />}
        <span>{status === "loading" ? "Ukladám…" : "Zmeniť heslo"}</span>
      </button>

      {status === "success" && (
        <div className={styles.status} role="status">
          <SuccessIcon />
          Heslo bolo zmenené.
        </div>
      )}
      {error && (
        <div className={`${styles.status} ${styles.statusError}`} role="alert">
          <ErrorIcon />
          {error}
        </div>
      )}
    </form>
  );
}
