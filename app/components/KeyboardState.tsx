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

// Po zatvorení klávesnice iOS Safari občas nechá zobrazenie posunuté tak, ako bolo
// pri otvorenej klávesnici (stránka bola vtedy kratšia — skrytá lišta, menší odstup)
// a dole ostane čierna medzera, kým používateľ prstom nescrollne. scrollTo na tú istú
// pozíciu Safari ignoruje, preto skutočný posun o 1px a späť v ďalšom snímku (to isté,
// čo urobí prst). Ak sa stránka nemá kam scrollovať (napr. otvorený chat má presne
// výšku obrazovky), na ten okamih sa o 1px predĺži.
function realignViewport() {
  const root = document.documentElement;
  const max = Math.max(0, root.scrollHeight - window.innerHeight);
  const target = Math.min(window.scrollY, max);
  const needsRoom = max === 0;
  if (needsRoom) root.style.minHeight = "calc(100vh + 1px)";
  window.scrollTo({ top: target === 0 ? 1 : target - 1, behavior: "instant" });
  requestAnimationFrame(() => {
    window.scrollTo({ top: target, behavior: "instant" });
    if (needsRoom) root.style.minHeight = "";
  });
}

export function KeyboardState() {
  useEffect(() => {
    const touch = window.matchMedia("(pointer: coarse)");
    const root = document.documentElement;
    const vv = window.visualViewport;
    let timers: ReturnType<typeof setTimeout>[] = [];
    // Okno po zatvorení klávesnice, kedy resize visualViewportu znamená jej zasúvanie.
    // Mimo neho sa resize deje aj pri bežnom scrollovaní (zbaľovanie lišty Safari) —
    // tam sa zobrazenie posúvať nesmie.
    let closingUntil = 0;

    const schedule = (fn: () => void) => {
      timers.forEach(clearTimeout);
      // klávesnica sa vysúva/zasúva ~250–300 ms; viac pokusov pokryje aj pomalšie zariadenia
      timers = [50, 300, 600].map((ms) => setTimeout(fn, ms));
    };

    const sync = () => {
      if (touch.matches && opensKeyboard(document.activeElement)) {
        const wasOpen = root.hasAttribute("data-keyboard-open");
        root.setAttribute("data-keyboard-open", "");
        if (!wasOpen) schedule(revealFocused);
      } else if (root.hasAttribute("data-keyboard-open")) {
        root.removeAttribute("data-keyboard-open");
        closingUntil = Date.now() + 1000;
        schedule(realignViewport);
      }
    };
    // zmena výšky visualViewportu = klávesnica sa práve dovysunula / zasunula
    const onViewportResize = () => {
      if (root.hasAttribute("data-keyboard-open")) revealFocused();
      else if (Date.now() < closingUntil) realignViewport();
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
