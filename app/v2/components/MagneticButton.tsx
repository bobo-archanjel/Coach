"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { gsap } from "gsap";

/**
 * Magnetický CTA — tlačidlo sa jemne pritiahne k pointeru v okruhu ~80px,
 * s `gsap.quickTo` (lacnejšie než opakované `gsap.to`, stavané presne pre
 * mousemove-frekvenciu volaní). Mimo dosahu sa pruží späť na stred.
 * Vypnuté pri `prefers-reduced-motion` a na touch zariadeniach (magnetizmus
 * nemá pri dotyku zmysel a `pointermove` tam nepríde v užitočnej podobe).
 */
export function MagneticButton({
  href,
  className,
  children,
  ...rest
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
  "data-cursor"?: string;
}) {
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (reduced || touch) return;

    const xTo = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3.out" });
    const yTo = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3.out" });
    const radius = 80;

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < radius + rect.width / 2) {
        xTo(dx * 0.35);
        yTo(dy * 0.35);
      } else {
        xTo(0);
        yTo(0);
      }
    };
    const onLeave = () => {
      xTo(0);
      yTo(0);
    };

    window.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <Link href={href} ref={ref} className={className} {...rest}>
      {children}
    </Link>
  );
}
