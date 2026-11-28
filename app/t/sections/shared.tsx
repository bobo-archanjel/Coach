import type { ReactNode } from "react";
import type { Surface } from "@/lib/publicPage/templates";
import styles from "../publicPage.module.css";
import tpl from "../templates.module.css";

/* Spoločné kúsky sekcií verejnej stránky: ikonky a obal sekcie podľa povrchu šablóny. */

export function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}

export function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.6 2.7 3.9 5.7 3.9 9S14.6 18.3 12 21c-2.6-2.7-3.9-5.7-3.9-9S9.4 5.7 12 3Z" />
    </svg>
  );
}

const SURFACE_CLASS: Record<Surface, string> = {
  card: styles.card,
  rule: tpl.surfaceRule,
  none: tpl.surfaceNone,
  soft: tpl.surfaceSoft,
};

/** Obal sekcie: nadpis + obsah; povrch (karta / čiara / bez / jemné pozadie) určuje recept šablóny. */
export function Shell({
  id,
  title,
  surface = "card",
  align,
  className,
  domId,
  children,
}: {
  id: string;
  domId?: string;
  title: string;
  surface?: Surface;
  align?: "center";
  className?: string;
  children: ReactNode;
}) {
  const cls = [styles.section, SURFACE_CLASS[surface], align === "center" ? tpl.centerHead : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <section id={domId} className={cls} aria-labelledby={`sec-${id}`} data-surface={surface}>
      <h2 id={`sec-${id}`}>{title}</h2>
      {children}
    </section>
  );
}
