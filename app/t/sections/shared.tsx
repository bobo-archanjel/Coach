import type { ReactNode } from "react";
import styles from "../site.module.css";

/* Spoločné kúsky sekcií verejnej stránky: ikonky a obal sekcie (pás na celú šírku + stredový obsah). */

const ICON = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export function PinIcon() {
  return (
    <svg {...ICON}>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}

export function GlobeIcon() {
  return (
    <svg {...ICON}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.6 2.7 3.9 5.7 3.9 9S14.6 18.3 12 21c-2.6-2.7-3.9-5.7-3.9-9S9.4 5.7 12 3Z" />
    </svg>
  );
}

export function ArrowIcon() {
  return (
    <svg {...ICON} strokeWidth={2}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** Obal sekcie: pás (data-band = striedanie pozadí), kotva, nadpis s drobným popiskom nad ním a obsah v kontajneri. */
export function Section({
  id,
  title,
  eyebrow,
  variant,
  band,
  kind,
  children,
}: {
  id: string;
  title?: string;
  eyebrow?: string;
  variant: string;
  band: "base" | "alt";
  kind: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={styles.section} aria-labelledby={`h-${kind}`} data-kind={kind} data-variant={variant} data-band={band}>
      <div className={styles.container}>
        {title !== undefined && eyebrow !== undefined && <SectionHead kind={kind} title={title} eyebrow={eyebrow} />}
        {children}
      </div>
    </section>
  );
}

export function SectionHead({ kind, title, eyebrow }: { kind: string; title: string; eyebrow: string }) {
  return (
    <div className={styles.head}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h2 id={`h-${kind}`} className={styles.h2}>
        {title}
      </h2>
    </div>
  );
}

/** Prvé písmeno mena do kolieska pri referencii (len ozdoba). */
export function initial(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? "";
}
