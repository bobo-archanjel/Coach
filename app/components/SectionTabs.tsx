"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import dash from "../dashboard/dashboard.module.css";
import styles from "./sectionTabs.module.css";

export interface SectionTabItem {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Záložky sekcií stránky (detail klienta, nastavenia trénera). Prepínanie je čisto klientské
 * (žiadna re-fetch dát) — obsah sekcií je už vyrenderovaný na serveri a poslaný sem ako hotové
 * React nody. Úvodná sekcia z `?<param>=`; prepnutie ju zapíše do adresy bez navigácie
 * (prvá sekcia parameter odstráni), takže obnovenie stránky ostane na tej istej záložke.
 *
 * layout "top"  — rad tlačidiel hore (detail klienta, tvar `.clientTabs` z dashboard.module.css)
 * layout "side" — na šírke ≥ 900px zvislé menu vľavo (sticky), pod tým rad hore; jedno DOM,
 *                 prepína sa len CSS (media query).
 */
export function SectionTabs({
  sections,
  initialId,
  param,
  ariaLabel,
  tourPrefix,
  tourId,
  layout = "top",
  clearParams,
}: {
  sections: SectionTabItem[];
  initialId?: string;
  param: string;
  ariaLabel: string;
  tourPrefix?: string;
  tourId?: string;
  layout?: "top" | "side";
  /** ďalšie parametre adresy, ktoré patria len k niektorej sekcii — pri prepnutí sa odstránia */
  clearParams?: string[];
}) {
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [activeId, setActiveIdState] = useState(
    initialId && sections.some((s) => s.id === initialId) ? initialId : (sections[0]?.id ?? ""),
  );
  const active = sections.find((s) => s.id === activeId) ?? sections[0];
  const side = layout === "side";

  // posuvný rad (mobil): aktívna záložka sa posunie do viditeľnej časti — aj pri otvorení cez ?<param>=
  // (posúva sa len rad záložiek, nie stránka)
  const firstScroll = useRef(true);
  useEffect(() => {
    const el = tabRefs.current[sections.findIndex((s) => s.id === activeId)];
    const list = el?.parentElement;
    if (!el || !list || list.scrollWidth <= list.clientWidth) return;
    const a = el.getBoundingClientRect();
    const l = list.getBoundingClientRect();
    const left = list.scrollLeft + (a.left - l.left) - (l.width - a.width) / 2;
    list.scrollTo({ left: Math.max(0, left), behavior: firstScroll.current ? "auto" : "smooth" });
    firstScroll.current = false;
  }, [activeId, sections]);

  const setActiveId = (id: string) => {
    setActiveIdState(id);
    const url = new URL(window.location.href);
    for (const k of clearParams ?? []) url.searchParams.delete(k);
    if (id === sections[0]?.id) url.searchParams.delete(param);
    else url.searchParams.set(param, id);
    window.history.replaceState(window.history.state, "", url);
  };

  // šípky, Home/End medzi záložkami (WAI-ARIA tabs); v bočnom rozložení aj ↑/↓
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = sections.findIndex((s) => s.id === active?.id);
    const n = sections.length;
    const forward = e.key === "ArrowRight" || (side && e.key === "ArrowDown");
    const back = e.key === "ArrowLeft" || (side && e.key === "ArrowUp");
    const next = forward ? (i + 1) % n : back ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    setActiveId(sections[next].id);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className={side ? styles.side : dash.clientDetail}>
      <div
        className={side ? styles.sideTabs : dash.clientTabs}
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        data-no-swipe
        data-tour={tourId}
      >
        {sections.map((s, i) => {
          const selected = s.id === active?.id;
          const base = side ? styles.sideTab : dash.clientTab;
          const on = side ? styles.sideTabActive : dash.clientTabActive;
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
              className={`${base} ${selected ? on : ""}`}
              onClick={() => setActiveId(s.id)}
              data-tour={tourPrefix ? `${tourPrefix}${s.id}` : undefined}
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
        className={side ? styles.sideContent : dash.clientDetailContent}
      >
        {active?.content}
      </div>
    </div>
  );
}
