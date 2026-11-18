"use client";

import styles from "./portal.module.css";

export type PlansTab = "plans" | "templates";

/**
 * Prepínač Plány / Moje šablóny v hlavičke sekcie Tréning aj Jedálniček (namiesto zbalenej
 * karty šablón nad plánmi). Štýl .modeToggle ako Vlastné / Od trénera; počty v zátvorke.
 * Šablóny sa ukazujú vždy, aj bez šablóny (prázdny stav vysvetlí, ako vzniká).
 */
export function PlansTabs({
  value,
  onChange,
  plansLabel,
  templatesLabel,
  plansCount,
  templatesCount,
  ariaLabel,
  plansTour,
  templatesTour,
}: {
  value: PlansTab;
  onChange: (tab: PlansTab) => void;
  plansLabel: string;
  templatesLabel: string;
  plansCount: number;
  templatesCount: number;
  ariaLabel: string;
  plansTour?: string;
  templatesTour?: string;
}) {
  const tabs = [
    { id: "plans" as const, label: plansLabel, count: plansCount, tour: plansTour },
    { id: "templates" as const, label: templatesLabel, count: templatesCount, tour: templatesTour },
  ];
  return (
    <div className={`${styles.modeToggle} ${styles.plTabs}`} role="radiogroup" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="radio"
          aria-checked={value === tab.id}
          className={value === tab.id ? styles.modeOn : undefined}
          onClick={() => onChange(tab.id)}
          data-tour={tab.tour}
        >
          {tab.label}{" "}
          <span className={styles.mpTabCount}>{tab.count}</span>
        </button>
      ))}
    </div>
  );
}
