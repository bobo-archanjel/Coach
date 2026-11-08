"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import styles from "../page.module.css";

gsap.registerPlugin(ScrollTrigger);

// Nahrádza tretí zamietnutý pokus o 3D centerpiece (mocap atlét → wireframe
// barbell → solid-faceted kettlebell, všetky odmietnuté vo vizuálnej
// kontrole). Namiesto ďalšieho vymysleného 3D objektu: reálne screenshoty
// appky ako parallax "karty" + plávajúce feature-badge — najliteralnejší
// možný dôkaz "o čo v appke ide", bezpečná DOM/CSS/GSAP technika bez
// 3D-modelovacieho rizika. Desktop-only (>=860px, rovnaká hranica ako
// predošlá 3D vrstva) — mobile necháva hero čisto textový.
const CARDS = [
  { src: "/v2/screens/dnes.png", alt: "Karta Dnes v klientskom portáli FitPilot", cls: "cardMain", baseRotate: -4, parallax: -34 },
  { src: "/v2/screens/chat.png", alt: "Chat medzi trénerom a klientom", cls: "cardChat", baseRotate: 7, parallax: 22 },
  { src: "/v2/screens/dennik.png", alt: "Denník stravy klienta", cls: "cardDennik", baseRotate: 4, parallax: -16 },
];

const BADGES = [
  { text: "✓ Schválené trénerom", cls: "badgeA" },
  { text: "🔥 AI navrhlo plán", cls: "badgeB" },
];

export function HeroShowcase() {
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = window.matchMedia("(max-width: 860px)").matches;
    if (mobile) return;

    const ctx = gsap.context(() => {
      const rotators = cardRefs.current.map((el, i) => {
        if (!el) return null;
        gsap.set(el, { rotate: CARDS[i].baseRotate, transformPerspective: 900 });
        if (!reduced) {
          gsap.to(el, {
            y: CARDS[i].parallax,
            ease: "none",
            scrollTrigger: { trigger: ".v2-hero", start: "top top", end: "bottom top", scrub: 0.6 },
          });
        }
        return gsap.quickTo(el, "rotate", { duration: 0.45, ease: "power2.out" });
      });

      if (!reduced) {
        const onMove = (e: PointerEvent) => {
          const mx = (e.clientX / window.innerWidth) * 2 - 1;
          rotators.forEach((rotate, i) => rotate?.(CARDS[i].baseRotate + mx * 4));
        };
        window.addEventListener("pointermove", onMove);
        return () => window.removeEventListener("pointermove", onMove);
      }
    }, rootRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={rootRef} className={styles.heroShowcase} aria-hidden="true">
      {CARDS.map((c, i) => (
        <div
          key={c.src}
          ref={(el) => {
            cardRefs.current[i] = el;
          }}
          className={`${styles.showcaseCard} ${styles[c.cls]}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.src} alt="" />
        </div>
      ))}
      {BADGES.map((b) => (
        <div key={b.cls} className={`${styles.showcaseBadge} ${styles[b.cls]}`}>
          {b.text}
        </div>
      ))}
    </div>
  );
}
