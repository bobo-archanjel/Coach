"use client";

import { useFormStatus } from "react-dom";
import styles from "../auth.module.css";

/** Odoslanie súhlasu — počas zápisu zablokované so spinnerom (dvojklik nič nepokazí). */
export function AcceptButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.btnSubmit} disabled={pending}>
      {pending && <span className={styles.spinner} aria-hidden="true" />}
      {label}
    </button>
  );
}
