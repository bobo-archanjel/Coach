"use client";

import { useState, type ReactNode } from "react";
import styles from "./portal.module.css";
import { HIDDEN_APPOINTMENT_COOKIE } from "@/lib/portal/appointmentNotice";


const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

/**
 * Upozornenie „Najbližší termín“ na karte Dnes s × (feature/klient-termin-sablony) — termín
 * je aj v kalendári, upozornenie sa dá skryť. Skrytie platí pre tento termín (id); ďalší
 * termín sa ukáže znova. Obsah (text s názvom a časom) vykreslí server.
 */
export function AppointmentNotice({ appointmentId, closeLabel, children }: { appointmentId: string; closeLabel: string; children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className={styles.appointment} data-testid="next-appointment">
      {children}
      <button
        type="button"
        className={styles.appointmentClose}
        aria-label={closeLabel}
        onClick={() => {
          document.cookie = `${HIDDEN_APPOINTMENT_COOKIE}=${encodeURIComponent(appointmentId)}; path=/; max-age=${60 * 60 * 24 * 90}; samesite=lax`;
          setHidden(true);
        }}
      >
        <CloseIcon />
      </button>
    </div>
  );
}
