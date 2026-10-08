"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Potiahnutie zľava doprava cez otvorené vlákno = späť na zoznam konverzácií
// (na mobile nahrádza tlačidlo "Späť na zoznam"; druhá cesta je ťuknúť na Správy
// v spodnej lište). Vlákno ide za prstom; po pustení za prahom dojde doprava a
// zoznam sa ukáže HNEĎ — je už v DOM, len skrytý cez .inboxGrid[data-has-selection]
// — bez čakania na server (predtým sa na sekundu ukázal starý chat, kým neprišla
// odpoveď na router.push). Zvislý scroll správ ani výber textu gesto nespustia.
const MIN_DX = 70;
const LOCK_DX = 12; // od koľkých px vodorovne sa pohyb berie ako ťah vlákna, nie scroll
const ANIM_MS = 180;

/**
 * Okamžite (bez čakania na server) prepne mobilné Správy z otvoreného vlákna na
 * zoznam: zoznam je už vyrenderovaný, len skrytý. Jeden atribút riadi všetko naraz
 * (zoznam, skrytie vlákna, hlavička + "Hromadná správa" cez :has v CSS), takže
 * stav je hneď taký, aký potom vráti server — nič nedoskakuje. Volá sa pri
 * potiahnutí, ťuknutí na Správy v spodnej lište (DashboardNav) aj pri návrate
 * systémovým gestom/tlačidlom späť (popstate).
 */
export function revealInboxList(): void {
  document.querySelector('[data-has-selection="true"]')?.setAttribute("data-has-selection", "false");
}

export function ThreadSwipeBack({ className, children }: { className?: string; children: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const [dx, setDx] = useState(0);
  const [animating, setAnimating] = useState(false);

  // Nové vlákno alebo návrat na zoznam (zmena ?client=) — vlákno späť na miesto.
  const client = searchParams.get("client");
  useEffect(() => {
    setDx(0);
    setAnimating(false);
  }, [client]);

  // Späť cez Safari (gesto od okraja / tlačidlo) na zoznam: popstate príde skôr, než
  // Next prekreslí stránku — zoznam ukázať hneď, inak na chvíľu bliklo staré vlákno.
  useEffect(() => {
    const onPop = () => {
      if (!new URLSearchParams(window.location.search).get("client")) revealInboxList();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const showList = () => {
    revealInboxList();
    router.push("/dashboard/spravy");
  };

  return (
    <div
      ref={ref}
      className={className}
      style={
        dx || animating
          ? {
              transform: `translateX(${dx}px)`,
              // postupne mizne s ťahom — bez holej čiernej plochy pri odchode
              opacity: Math.max(0, 1 - dx / 320),
              transition: animating ? `transform ${ANIM_MS}ms ease-out, opacity ${ANIM_MS}ms ease-out` : "none",
            }
          : undefined
      }
      onTouchStart={(e) => {
        if (!client || e.touches.length !== 1) {
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
            start.current = null; // zvislý scroll správ — gesto vzdať
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
          window.setTimeout(showList, ANIM_MS);
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
