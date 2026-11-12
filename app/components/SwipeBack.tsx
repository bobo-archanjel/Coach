"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

// Potiahnutie prstom zľava doprava = späť (na mobile nahrádza odkaz „Späť na …“; rovnaký
// princíp ako ThreadSwipeBack v Správach). Obsah ide za prstom a postupne mizne; po
// pustení za prahom dojde doprava a otvorí sa `href`. Zvislý scroll ani výber textu
// gesto nespustia. Na počítači (myš) sa nič nedeje — tam vedie späť bočné menu.
const MIN_DX = 80;
const LOCK_DX = 12; // od koľkých px vodorovne sa pohyb berie ako ťah, nie scroll
const ANIM_MS = 180;
// Ťah začatý tu nie je gesto späť: polia (kurzor, výber textu), tlačidlá a odkazy
// (ťuknutie), prvky s vlastným vodorovným posúvaním (dráha dní) — [data-no-swipe].
const NO_SWIPE = "form, textarea, input, select, button, a, [data-no-swipe], [role='dialog']";

export function SwipeBack({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  const start = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const [dx, setDx] = useState(0);
  const [animating, setAnimating] = useState(false);

  return (
    <div
      className={className}
      style={
        dx || animating
          ? {
              transform: `translateX(${dx}px)`,
              opacity: Math.max(0, 1 - dx / 360),
              transition: animating ? `transform ${ANIM_MS}ms ease-out, opacity ${ANIM_MS}ms ease-out` : "none",
            }
          : undefined
      }
      onTouchStart={(e) => {
        if (e.touches.length !== 1 || (e.target as Element).closest(NO_SWIPE)) {
          start.current = null;
          return;
        }
        const t = e.touches[0];
        start.current = { x: t.clientX, y: t.clientY, dragging: false };
        setAnimating(false);
      }}
      onTouchMove={(e) => {
        const s = start.current;
        if (!s) return;
        const t = e.touches[0];
        const mx = t.clientX - s.x;
        const my = t.clientY - s.y;
        if (!s.dragging) {
          if (Math.abs(my) > LOCK_DX && Math.abs(my) > Math.abs(mx)) {
            start.current = null; // zvislý scroll stránky — gesto vzdať
            return;
          }
          if (window.getSelection()?.toString()) {
            start.current = null; // používateľ označuje text
            return;
          }
          if (mx > LOCK_DX) s.dragging = true;
        }
        if (s.dragging) setDx(Math.max(0, mx));
      }}
      onTouchEnd={() => {
        const s = start.current;
        start.current = null;
        if (!s?.dragging) return;
        setAnimating(true);
        if (dx >= MIN_DX) {
          setDx(window.innerWidth);
          window.setTimeout(() => router.push(href), ANIM_MS);
        } else {
          setDx(0);
        }
      }}
      onTouchCancel={() => {
        start.current = null;
        setAnimating(true);
        setDx(0);
      }}
    >
      {children}
    </div>
  );
}
