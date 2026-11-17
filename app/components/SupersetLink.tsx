"use client";

import styles from "./workoutBuilder.module.css";

const ChainIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 1 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 1 0 5.66 5.66l1-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/**
 * Prepínač medzi dvomi kartami cvikov v builderi (tréner aj klient): spojí cvik
 * s nasledujúcim do supersérie, alebo spojenie zruší. Texty dodá rodič (rôzne menné
 * priestory prekladov).
 */
export function SupersetLink({
  linked,
  label,
  ariaLabel,
  disabled = false,
  onToggle,
}: {
  linked: boolean;
  label: string;
  ariaLabel: string;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={styles.ssLinkRow}>
      <button
        type="button"
        className={`${styles.ssLink} ${linked ? styles.ssLinkOn : ""}`}
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={linked}
        aria-label={ariaLabel}
      >
        <ChainIcon />
        {label}
      </button>
    </div>
  );
}
