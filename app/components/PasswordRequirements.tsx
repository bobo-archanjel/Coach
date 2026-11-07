"use client";

// FitPilot — feature/navod: živý checklist požiadaviek na heslo (Miller's law —
// max 3 položky, nie vyčerpávajúci zoznam). Ukazuje sa, kým heslo nesplní
// všetko; po splnení zmizne (Zeigarnik effect naopak — dokončená vec sa
// nemusí pripomínať ďalej). Zdieľané medzi registráciou a resetom hesla.

import { passwordCriteria } from "@/lib/passwordStrength";
import styles from "./PasswordRequirements.module.css";

const CheckMark = ({ met }: { met: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    {met ? (
      <path d="M2.5 7.2l2.8 2.8L11.5 3.5" stroke="var(--moss, #4c7a5e)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    ) : (
      <circle cx="7" cy="7" r="5.3" stroke="var(--steel-line)" strokeWidth="1.4" />
    )}
  </svg>
);

export function PasswordRequirements({ password }: { password: string }) {
  const criteria = passwordCriteria(password);
  return (
    <ul className={styles.list} aria-live="polite">
      {criteria.map((c) => (
        <li key={c.key} className={c.met ? styles.met : undefined}>
          <CheckMark met={c.met} />
          {c.label}
        </li>
      ))}
    </ul>
  );
}
