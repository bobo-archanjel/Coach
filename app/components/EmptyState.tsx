// FitPilot — feature/navod: zdieľaný empty-state primitív (dashboard aj portál).
// Vždy s jasným ďalším krokom (Fitts's law — akcia je skutočný klikateľný cieľ,
// nie len text "urob X vyššie"), nie len oznámenie prázdneho stavu.

import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.wrap}>
      {icon && (
        <div className={styles.icon} aria-hidden="true">
          {icon}
        </div>
      )}
      <h2>{title}</h2>
      {body && <p>{body}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
