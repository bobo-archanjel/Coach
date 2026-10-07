"use client";

// Cloudflare Turnstile widget pre prihlásenie/registráciu (feature/security) —
// rovnaký Cloudflare projekt ako waitlist/index.html, len tam sa widget skenuje
// z DOM automaticky (statická stránka, nikdy sa nezmountuje znova), kým tu sa
// login/register formulár mountuje/unmountuje pri prepínaní tabov — potrebuje
// explicitný `render()`/`remove()` viazaný na React lifecycle.

import Script from "next/script";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: { sitekey: string; theme?: "dark" | "light"; callback?: (token: string) => void },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
      getResponse: (widgetId?: string) => string;
    };
  }
}

/** Verejný "site key" — nie tajomstvo (je vidno v zdrojáku každej stránky),
 * rovnaký Cloudflare Turnstile projekt ako waitlist/index.html. Tajný kľúč
 * (TURNSTILE_SECRET_KEY) sa overuje výhradne na serveri (lib/turnstile.ts). */
const SITE_KEY = "0x4AAAAAAFA1_F-hL8XibALT";

/** Načíta Turnstile skript raz pre celú appku — vlož na stránku, ktorá widget používa. */
export function TurnstileScript() {
  return <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />;
}

export function useTurnstile() {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const tokenRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | null = null;

    function tryRender() {
      if (cancelled || !containerRef.current || widgetIdRef.current || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        theme: "dark",
        callback: (token) => {
          tokenRef.current = token;
        },
      });
      if (poll) {
        clearInterval(poll);
        poll = null;
      }
    }

    tryRender();
    // Skript (TurnstileScript) sa mohol pri mounte ešte len načítavať — krátky
    // poll namiesto zložitého vlastného event/callback systému okolo neho.
    if (!window.turnstile) poll = setInterval(tryRender, 200);

    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, []);

  function getToken(): string {
    if (widgetIdRef.current && window.turnstile) {
      return window.turnstile.getResponse(widgetIdRef.current) || tokenRef.current;
    }
    return tokenRef.current;
  }

  /** Token je jednorazový — po neúspešnom pokuse treba nový na ďalší submit. */
  function reset() {
    if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current);
    tokenRef.current = "";
  }

  return { containerRef, getToken, reset };
}
