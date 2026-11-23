"use client";

// Cloudflare Turnstile widget pre prihlásenie/registráciu (feature/security) —
// rovnaký Cloudflare projekt ako waitlist/index.html, len tam sa widget skenuje
// z DOM automaticky (statická stránka, nikdy sa nezmountuje znova), kým tu sa
// login/register formulár mountuje/unmountuje pri prepínaní tabov — potrebuje
// explicitný `render()`/`remove()` viazaný na kontajner formulára (callback ref).

import Script from "next/script";
import { useCallback, useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          theme?: "dark" | "light" | "auto";
          appearance?: "always" | "execute" | "interaction-only";
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "timeout-callback"?: () => void;
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
      getResponse: (widgetId?: string) => string;
    };
  }
}

/** Verejný "site key" — nie tajomstvo (je vidno v zdrojáku každej stránky).
 * Vlastný Turnstile widget pre doménu coach-pi-bice.vercel.app (založený
 * 2026-11-08, pôvodný projekt pre myfitpilot.sk bol na neznámom účte).
 * Tajný kľúč tohto widgetu patrí do
 * Supabase Dashboard → Authentication → Attack Protection → CAPTCHA (provider Turnstile):
 * token sa posiela Supabase cez `options.captchaToken` a overí ho GoTrue. */
// Pozn.: Supabase Auth (Attack Protection → CAPTCHA) musí mať nastavený SECRET tohto
// istého widgetu — token z tohto widgetu sa posiela Supabase (`options.captchaToken`)
// a overuje ho GoTrue, nie naša appka. Na lokálny/test možno kľúč prebiť env premennou.
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "0x4AAAAAAF4_5LQRK4GF8cow";

/** Načíta Turnstile skript raz pre celú appku — vlož na stránku, ktorá widget používa. */
export function TurnstileScript() {
  return <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />;
}

/** Téma widgetu podľa koreňa dizajnu v6 (data-theme z cookie: light/dark/auto) — v svetlej
 * téme tmavý widget pôsobil ako cudzí prvok. Zmenu témy prepínačom zachytí až ďalší mount. */
function pageTheme(el: HTMLElement): "dark" | "light" | "auto" {
  const t = el.closest("[data-v6-root]")?.getAttribute("data-theme");
  return t === "dark" || t === "light" ? t : "auto";
}

/**
 * Widget je viazaný na SKUTOČNÝ kontajner (callback ref), nie na mount stránky. Formuláre
 * prihlásenia, registrácie aj zabudnutého hesla sa pri prepínaní vymieňajú — pôvodná verzia
 * vykreslila widget raz pri načítaní, takže po „Registrácia“ → „Prihlásenie“ (alebo návrate
 * zo zabudnutého hesla) ostal pripnutý k už neexistujúcemu formuláru a miesto bolo prázdne,
 * kým používateľ neobnovil stránku. Teraz: nový kontajner = nový widget, odpojený = zmazaný.
 */
export function useTurnstile(opts: { invisible?: boolean } = {}) {
  const invisible = opts.invisible ?? false;
  const elRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const tokenRef = useRef("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  const removeWidget = useCallback(() => {
    stopPoll();
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.remove(widgetIdRef.current);
      } catch {
        /* widget už neexistuje (kontajner zmizol z DOM) */
      }
    }
    widgetIdRef.current = null;
    tokenRef.current = "";
  }, [stopPoll]);

  /** true = hotovo (vykreslené alebo niet kam), false = skript sa ešte načítava. */
  const tryRender = useCallback((): boolean => {
    const el = elRef.current;
    if (!el || widgetIdRef.current) return true;
    if (!window.turnstile) return false;
    widgetIdRef.current = window.turnstile.render(el, {
      sitekey: SITE_KEY,
      theme: pageTheme(el),
      // „interaction-only“ = widget sa ukáže len ak Cloudflare žiada interakciu (krok s kódom)
      ...(invisible ? { appearance: "interaction-only" as const } : {}),
      callback: (token) => {
        tokenRef.current = token;
      },
      // token po 300 s vyprší (widget sa sám obnoví) — starý sa už nesmie odoslať
      "expired-callback": () => {
        tokenRef.current = "";
      },
      // interaktívna výzva vypršala bez odpovede — nový widget namiesto „mŕtveho“
      "timeout-callback": () => {
        tokenRef.current = "";
        if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current);
      },
    });
    return true;
  }, [invisible]);

  const containerRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (el === elRef.current) return;
      removeWidget();
      elRef.current = el;
      if (!el || tryRender()) return;
      // skript (TurnstileScript) sa ešte načítava — krátky poll, kým nie je window.turnstile
      pollRef.current = setInterval(() => {
        if (tryRender()) stopPoll();
      }, 200);
    },
    [removeWidget, tryRender, stopPoll],
  );

  // odchod zo stránky
  useEffect(() => () => removeWidget(), [removeWidget]);

  function getToken(): string {
    if (widgetIdRef.current && window.turnstile) {
      return window.turnstile.getResponse(widgetIdRef.current) || tokenRef.current;
    }
    return tokenRef.current;
  }

  /** Počká na token (widget ho vydá po prejdení výzvy) — vráti "" po vypršaní limitu. */
  async function waitForToken(timeoutMs = 4_000): Promise<string> {
    const until = Date.now() + timeoutMs;
    for (;;) {
      const token = getToken();
      if (token || Date.now() >= until) return token;
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  /** Token je jednorazový — po neúspešnom pokuse treba nový na ďalší submit. */
  function reset() {
    if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current);
    tokenRef.current = "";
  }

  return { containerRef, getToken, waitForToken, reset };
}
