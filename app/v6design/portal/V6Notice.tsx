import type { ReactNode } from "react";
import s from "./styles/portal.module.css";

/* Prázdna/chybová obrazovka v6 — rovnaké API a texty ako app/portal/Notice.tsx. */

export const AlertIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 8.5v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <circle cx="12" cy="16.6" r="0.4" fill="currentColor" stroke="currentColor" strokeWidth="1.2" />
    <path d="M12 4 3 19.5h18L12 4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
  </svg>
);

export function Notice({
  icon,
  title,
  children,
  action,
  tone = "status",
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
  tone?: "status" | "alert";
}) {
  return (
    <div className={s.notice} role={tone}>
      <span className={s.noticeTile} aria-hidden="true">
        {icon}
      </span>
      <h1>{title}</h1>
      <p>{children}</p>
      {action}
    </div>
  );
}
