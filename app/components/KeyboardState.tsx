"use client";

import { useEffect } from "react";

// Na dotykových zariadeniach otvorí focus textového poľa softvérovú klávesnicu a
// fixná spodná navigácia (dashboard .navList, portál .nav) by ostala nalepená nad ňou
// a zaberala aj tak malý viditeľný priestor. Komponent drží na <html> atribút
// `data-keyboard-open`, podľa ktorého ju CSS skryje. Focus je spoľahlivejší signál
// než visualViewport resize (iOS pri klávesnici layout viewport nemení konzistentne).
const NON_TEXT_INPUTS = new Set(["checkbox", "radio", "range", "button", "submit", "reset", "file", "color", "image"]);

function opensKeyboard(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly;
  if (el instanceof HTMLInputElement) return !el.readOnly && !NON_TEXT_INPUTS.has(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}

// iOS posunie stránku k poľu ešte pred tým, než skrytie lišty (a jej rezervovaného
// odstupu) stránku skráti — pole potom skončí pod klávesnicou. Po ustálení layoutu
// ho preto dorovnáme do viditeľnej časti (visualViewport = plocha nad klávesnicou).
function revealFocused() {
  const el = document.activeElement;
  if (!opensKeyboard(el)) return;
  const vv = window.visualViewport;
  const top = vv ? vv.offsetTop : 0;
  const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const rect = (el as HTMLElement).getBoundingClientRect();
  const margin = 16;
  if (rect.bottom + margin > bottom) {
    window.scrollBy(0, rect.bottom + margin - bottom);
  } else if (rect.top - margin < top) {
    window.scrollBy(0, rect.top - margin - top);
  }
}

export function KeyboardState() {
  useEffect(() => {
    const touch = window.matchMedia("(pointer: coarse)");
    const root = document.documentElement;
    const vv = window.visualViewport;
    let timers: ReturnType<typeof setTimeout>[] = [];

    const scheduleReveal = () => {
      timers.forEach(clearTimeout);
      // klávesnica sa vysúva ~250–300 ms; viac pokusov pokryje aj pomalšie zariadenia
      timers = [50, 300, 600].map((ms) => setTimeout(revealFocused, ms));
    };

    const sync = () => {
      if (touch.matches && opensKeyboard(document.activeElement)) {
        const wasOpen = root.hasAttribute("data-keyboard-open");
        root.setAttribute("data-keyboard-open", "");
        if (!wasOpen) scheduleReveal();
      } else {
        root.removeAttribute("data-keyboard-open");
      }
    };
    // zmena výšky visualViewportu = klávesnica sa práve dovysunula
    const onViewportResize = () => {
      if (root.hasAttribute("data-keyboard-open")) revealFocused();
    };
    vv?.addEventListener("resize", onViewportResize);
    // focusout sa vyvolá skôr, než focus dopadne na ďalšie pole — pri preskakovaní
    // medzi poliami by lišta krátko bliknula; preto kontrola až po dokončení presunu.
    const onFocusOut = () => setTimeout(sync, 0);

    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", onFocusOut);
      vv?.removeEventListener("resize", onViewportResize);
      timers.forEach(clearTimeout);
      root.removeAttribute("data-keyboard-open");
    };
  }, []);

  return null;
}
