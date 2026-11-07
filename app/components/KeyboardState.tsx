"use client";

import { useEffect } from "react";

// Na dotykových zariadeniach otvorí focus textového poľa softvérovú klávesnicu a
// fixná spodná navigácia (dashboard .navList, portál .nav) by ostala nalepená nad ňou
// a zaberala aj tak malý viditeľný priestor. Komponent drží na <html> atribút
// `data-keyboard-open`, podľa ktorého ju CSS skryje. Focus je spoľahlivejší signál
// než visualViewport resize (iOS pri klávesnici layout viewport nemení konzistentne).
const NON_TEXT_INPUTS = new Set(["checkbox", "radio", "range", "button", "submit", "reset", "file", "color", "image"]);

function opensKeyboard(el: Element | null): boolean {
  // Pole, ktoré už nie je na stránke alebo je skryté (napr. zatvorené vlákno chatu),
  // klávesnicu nedrží — prehliadač pri jeho odstránení focusout nemusí ohlásiť.
  if (!el || !el.isConnected || el.getClientRects().length === 0) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly;
  if (el instanceof HTMLInputElement) return !el.readOnly && !NON_TEXT_INPUTS.has(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}

// Pole na písanie k ploche nad klávesnicou posúva sám iOS — plynulo, spolu s jej
// vysúvaním. Predtým sme ho 50 ms po ťuknutí posunuli ešte raz (skokom), oba posuny
// sa sčítali a stránka vyletela príliš vysoko, kým sa nevrátila. Teraz len poistka:
// až keď sa klávesnica ustáli, a len ak pole naozaj ostalo pod ňou (napr. stránka
// sa skrátila skrytím lišty), dorovná sa plynulo o presne chýbajúci kus.
function revealIfHidden(): boolean {
  const el = document.activeElement;
  if (!opensKeyboard(el)) return false;
  const vv = window.visualViewport;
  const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const overlap = (el as HTMLElement).getBoundingClientRect().bottom + 12 - bottom;
  if (overlap <= 1) return false;
  window.scrollBy({ top: overlap, behavior: "smooth" });
  return true;
}
// --app-h: skutočná výška obrazovky (innerHeight), na ktorej sedí fixná spodná lišta.
// 100svh je na iOS 26 menšie (počíta s rozbaleným panelom Safari, ktorý ale prekrýva
// stránku) — chat podľa neho končil ~70 px nad lištou. Nastavuje ho aj skript v <head>
// (prvé vykreslenie); tu sa udržiava pri zmene veľkosti, nie počas otvorenej klávesnice
// (vtedy innerHeight zmenšuje klávesnica a výšku chatu rieši iné pravidlo).
function syncAppHeight() {
  if (document.documentElement.hasAttribute("data-keyboard-open")) return;
  document.documentElement.style.setProperty("--app-h", `${window.innerHeight}px`);
}
/** Ako dlho po otvorení klávesnice ešte dorovnávať (potom by sme bojovali so scrollom používateľa). */
const REVEAL_WINDOW_MS = 1500;
/** Klávesnica je "ustálená", keď sa visualViewport takto dlho nezmenil (veľkosť ani posun). */
const SETTLE_MS = 150;
/**
 * O koľko (px) musí byť viditeľná plocha menšia než pred otvorením, aby to bola klávesnica.
 * Najmenšia softvérová klávesnica (iPhone SE, na šírku) má cez 150 px; zbalenie lišty
 * Safari alebo návrhy slov nad klávesnicou sú zmeny pod touto hranicou.
 */
const KEYBOARD_MIN_PX = 150;

/**
 * Ťuknutie na tieto prvky klávesnicu nezatvára — majú vlastnú akciu (tlačidlo, pole,
 * odkaz). [data-keep-keyboard] = celá oblasť, kde má klávesnica ostať (composer chatu).
 */
const KEEPS_KEYBOARD =
  "input, textarea, select, button, a[href], label, [contenteditable=''], [contenteditable='true'], [role='button'], [role='tab'], [data-keep-keyboard]";
/** Ťuknutie = prst sa pohol menej než toto (inak scroll) a … */
const TAP_SLOP_PX = 10;
/** … netrval dlhšie než toto (inak podržanie — výber textu v správe). */
const TAP_MAX_MS = 500;

/** Výška viditeľnej plochy v CSS px nezávisle od priblíženia prstami (pinch zoom). */
function visibleHeight(vv: VisualViewport): number {
  return vv.height * vv.scale;
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
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let openedAt = 0;
    // Najviac jedno dorovnanie na jedno otvorenie klávesnice (dva plynulé posuny
    // by sa mohli sčítať, kým prvý ešte beží).
    let corrected = false;

    // Hlásil prehliadač zmenu visualViewportu? Ak áno, poistný časovač netreba.
    let sawViewportChange = false;
    // Okno po zatvorení klávesnice, kedy resize visualViewportu znamená jej zasúvanie.
    // Mimo neho sa resize deje aj pri bežnom scrollovaní (zbaľovanie lišty Safari) —
    // tam sa zobrazenie posúvať nesmie.
    let closingUntil = 0;
    // Výška viditeľnej plochy tesne pred otvorením klávesnice (focusin príde skôr, než
    // sa vysunie) a či sme klávesnicu naozaj videli (plocha klesla o KEYBOARD_MIN_PX).
    // Bez tej druhej podmienky by sme na iPade s hardvérovou klávesnicou, kde sa
    // softvérová nikdy neukáže, "zatvorenie" ohlásili hneď.
    let baselineHeight = 0;
    let keyboardSeen = false;

    const schedule = (fn: () => void) => {
      timers.forEach(clearTimeout);
      // klávesnica sa vysúva/zasúva ~250–300 ms; viac pokusov pokryje aj pomalšie zariadenia
      timers = [50, 300, 600].map((ms) => setTimeout(fn, ms));
    };

    const sync = () => {
      if (touch.matches && opensKeyboard(document.activeElement)) {
        const wasOpen = root.hasAttribute("data-keyboard-open");
        root.setAttribute("data-keyboard-open", "");
        if (!wasOpen) {
          openedAt = Date.now();
          corrected = false;
          sawViewportChange = false;
          baselineHeight = vv ? visibleHeight(vv) : window.innerHeight;
          keyboardSeen = false;
          // poistka, ak by prehliadač zmenu visualViewportu vôbec neohlásil
          timers.forEach(clearTimeout);
          timers = [setTimeout(() => !sawViewportChange && settle(), 700)];
        }
      } else if (root.hasAttribute("data-keyboard-open")) {
        root.removeAttribute("data-keyboard-open");
        closingUntil = Date.now() + 1000;
        schedule(realignViewport);
      }
    };
    // Kontrola poľa až SETTLE_MS po poslednej zmene visualViewportu — kým iOS ešte
    // vysúva klávesnicu a posúva výrez (resize aj scroll udalosti), nezasahujeme.
    const settle = () => {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        if (!corrected && revealIfHidden()) corrected = true;
      }, SETTLE_MS);
    };
    const opening = () => root.hasAttribute("data-keyboard-open") && Date.now() - openedAt < REVEAL_WINDOW_MS;
    // zmena výšky visualViewportu = klávesnica sa vysúva / zasúva
    /**
     * Zasunula sa klávesnica, hoci fokus ostal v poli? iOS Safari to robí po ťuknutí
     * vedľa alebo potiahnutí klávesnice dole — focusout nepríde. Stránka by ostala
     * v režime "otvorená klávesnica": skrytá lišta, chat vytiahnutý na výšku pre
     * klávesnicu, stránka posunutá hore a pod poľom čierna plocha. Fokus preto
     * zrušíme sami — bežný focusout → sync() → lišta späť + realignViewport (pole dole).
     * Pole ďalším ťuknutím znova dostane fokus aj focusin (keby fokus ostal, ťuknutie
     * by klávesnicu otvorilo bez focusin a stav by sa nezapol).
     * Volá sa pri resize visualViewportu.
     */
    const checkKeyboardGone = (): boolean => {
      if (!vv || !root.hasAttribute("data-keyboard-open")) return false;
      const h = visibleHeight(vv);
      if (h < baselineHeight - KEYBOARD_MIN_PX) {
        keyboardSeen = true;
        return false;
      }
      if (!keyboardSeen) return false;
      keyboardSeen = false;
      const el = document.activeElement;
      if (el instanceof HTMLElement && opensKeyboard(el)) el.blur();
      setTimeout(sync, 0);
      return true;
    };
    const onViewportResize = () => {
      if (root.hasAttribute("data-keyboard-open")) {
        sawViewportChange = true;
        if (checkKeyboardGone()) return;
        if (opening()) settle();
      } else if (Date.now() < closingUntil) realignViewport();
    };
    // posun výrezu počas vysúvania klávesnice (iOS) — ešte nie je ustálené
    const onViewportScroll = () => {
      if (!opening()) return;
      sawViewportChange = true;
      settle();
    };
    vv?.addEventListener("resize", onViewportResize);
    vv?.addEventListener("scroll", onViewportScroll);
    // focusout sa vyvolá skôr, než focus dopadne na ďalšie pole — pri preskakovaní
    // medzi poliami by lišta krátko bliknula; preto kontrola až po dokončení presunu.
    const onFocusOut = () => setTimeout(sync, 0);

    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", onFocusOut);
    // Poistka: ak fokus "zostal visieť" na odstránenom/skrytom poli (bez focusout),
    // stav sa prekontroluje pri najbližšom dotyku obrazovky.
    //
    // Ťuknutie na prázdne miesto pri otvorenej klávesnici (napr. čierna plocha medzi
    // poľom a klávesnicou, správy): iOS Safari sa tu správa nevyspytateľne — niekedy
    // klávesnicu nechá, niekedy ju zasunie a fokus v poli NECHÁ bez focusout. Stránka
    // potom ostala v režime "otvorená klávesnica" (skrytá lišta, pole v strede, čierna
    // plocha pod ním). Preto o tom rozhodujeme sami, ako natívne appky: ťuknutie mimo
    // poľa a mimo ovládacích prvkov klávesnicu VŽDY zatvorí cez blur() → focusout →
    // sync() → lišta späť + realignViewport. Scroll a podržanie (výber textu) nie.
    let tap: { x: number; y: number; t: number; target: EventTarget | null } | null = null;
    const onTouchStart = (e: TouchEvent) => {
      if (!root.hasAttribute("data-keyboard-open")) {
        tap = null;
        return;
      }
      setTimeout(sync, 0);
      const t = e.touches[0];
      tap = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY, t: Date.now(), target: e.target } : null;
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (tap && t && Math.hypot(t.clientX - tap.x, t.clientY - tap.y) > TAP_SLOP_PX) tap = null;
    };
    const onTouchEnd = () => {
      const current = tap;
      tap = null;
      if (!current || Date.now() - current.t > TAP_MAX_MS) return;
      if (!root.hasAttribute("data-keyboard-open")) return;
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !opensKeyboard(active)) return;
      const target = current.target;
      if (target instanceof Element && (active.contains(target) || target.closest(KEEPS_KEYBOARD))) return;
      active.blur();
    };
    document.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true, capture: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true, capture: true });
    syncAppHeight();
    window.addEventListener("resize", syncAppHeight);
    return () => {
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("touchstart", onTouchStart, { capture: true });
      document.removeEventListener("touchmove", onTouchMove, { capture: true });
      document.removeEventListener("touchend", onTouchEnd, { capture: true });
      window.removeEventListener("resize", syncAppHeight);
      vv?.removeEventListener("resize", onViewportResize);
      vv?.removeEventListener("scroll", onViewportScroll);
      timers.forEach(clearTimeout);
      clearTimeout(settleTimer);
      root.removeAttribute("data-keyboard-open");
    };
  }, []);

  return null;
}
