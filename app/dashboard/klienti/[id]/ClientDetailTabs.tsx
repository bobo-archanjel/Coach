"use client";

import { useState, type ReactNode } from "react";
import styles from "../../dashboard.module.css";

const HamburgerIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M2 4.5h12M2 8h12M2 11.5h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export interface ClientDetailSection {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Detail klienta bol jeden dlhý scroll cez všetky karty naraz — neprehľadné pri
 * viacerých sekciách (Info, Analytika, Tréningy, Aktivita). Toto je lokálne
 * menu sekcií SCOPOVANÉ na túto stránku (nie globálna dashboard nav vľavo) —
 * na desktope tenký vertikálny zoznam vedľa obsahu, na mobile hamburger nad
 * obsahom (rovnaký breakpoint 880px ako globálna nav v DashboardNav.tsx).
 * Prepínanie je čisto klientské (žiadna re-fetch dát) — obsah sekcií je už
 * vyrenderovaný na serveri a poslaný sem ako hotové React nody.
 */
export function ClientDetailTabs({ sections }: { sections: ClientDetailSection[] }) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? "");
  const [mobileOpen, setMobileOpen] = useState(false);
  const active = sections.find((s) => s.id === activeId) ?? sections[0];

  function select(id: string) {
    setActiveId(id);
    setMobileOpen(false);
  }

  return (
    <div className={styles.clientDetailLayout}>
      <nav className={styles.clientSubNav} aria-label="Sekcie klienta">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`${styles.clientSubNavItem} ${s.id === active?.id ? styles.clientSubNavItemActive : ""}`}
            onClick={() => select(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className={styles.clientSubNavMobile}>
        <button
          type="button"
          className={styles.clientSubNavMobileTrigger}
          onClick={() => setMobileOpen((o) => !o)}
          aria-expanded={mobileOpen}
        >
          <HamburgerIcon />
          {active?.label}
        </button>
        {mobileOpen && (
          <div className={styles.clientSubNavMobileMenu}>
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`${styles.clientSubNavMobileItem} ${s.id === active?.id ? styles.clientSubNavMobileItemActive : ""}`}
                onClick={() => select(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.clientDetailContent}>{active?.content}</div>
    </div>
  );
}
