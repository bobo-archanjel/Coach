"use client";

import { useTranslations } from "next-intl";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import styles from "../../dashboard.module.css";

export interface ClientDetailSection {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Detail klienta bol jeden dlhý scroll cez všetky karty naraz — neprehľadné pri
 * viacerých sekciách (Tréningy, Jedálničky, Analytika, Info). Toto sú záložky sekcií
 * SCOPOVANÉ na túto stránku (nie globálna dashboard nav): rad tlačidiel hore — na
 * počítači aj na mobile — a obsah vybranej sekcie pod nimi. Prepínanie je čisto
 * klientské (žiadna re-fetch dát) — obsah sekcií je už vyrenderovaný na serveri
 * a poslaný sem ako hotové React nody. Úvodná sekcia z `?sekcia=` (napr. odkaz
 * „Upraviť makrá“ → jedalnicky); prepnutie ju zapíše do adresy bez navigácie,
 * takže obnovenie stránky ostane na tej istej záložke.
 */
export function ClientDetailTabs({ sections, initialId }: { sections: ClientDetailSection[]; initialId?: string }) {
  const t = useTranslations("clientDetail");
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [activeId, setActiveIdState] = useState(
    initialId && sections.some((s) => s.id === initialId) ? initialId : (sections[0]?.id ?? ""),
  );
  const active = sections.find((s) => s.id === activeId) ?? sections[0];

  const setActiveId = (id: string) => {
    setActiveIdState(id);
    const url = new URL(window.location.href);
    if (id === sections[0]?.id) url.searchParams.delete("sekcia");
    else url.searchParams.set("sekcia", id);
    window.history.replaceState(window.history.state, "", url);
  };

  // šípky ←/→, Home/End medzi záložkami (WAI-ARIA tabs)
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = sections.findIndex((s) => s.id === active?.id);
    const next =
      e.key === "ArrowRight" ? (i + 1) % sections.length
      : e.key === "ArrowLeft" ? (i - 1 + sections.length) % sections.length
      : e.key === "Home" ? 0
      : e.key === "End" ? sections.length - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    setActiveId(sections[next].id);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className={styles.clientDetail}>
      <div className={styles.clientTabs} role="tablist" aria-label={t("tabsAria")} onKeyDown={onKeyDown} data-no-swipe>
        {sections.map((s, i) => {
          const selected = s.id === active?.id;
          return (
            <button
              key={s.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${s.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              className={`${styles.clientTab} ${selected ? styles.clientTabActive : ""}`}
              onClick={() => setActiveId(s.id)}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div
        id={`${baseId}-panel`}
        role="tabpanel"
        aria-labelledby={active ? `${baseId}-tab-${active.id}` : undefined}
        className={styles.clientDetailContent}
      >
        {active?.content}
      </div>
    </div>
  );
}
