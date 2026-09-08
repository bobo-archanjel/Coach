"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useMotionValueEvent, type MotionValue } from "motion/react";
import { phoneState } from "../lib/phoneState";
import styles from "../page.module.css";

// three.js/@react-three/fiber/drei live in PhoneCanvasInner, loaded only
// when actually needed — mobile and reduced-motion visitors never download
// them, they get the static screenshot fallback below instead.
const PhoneCanvasInner = dynamic(() => import("./PhoneCanvasInner"), { ssr: false });

export function PhoneHero({ progress }: { progress: MotionValue<number> }) {
  const [capable, setCapable] = useState(false); // desktop + motion allowed
  const [nearView, setNearView] = useState(true); // hero is close enough to be worth rendering
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = window.matchMedia("(max-width: 999px)").matches;
    setCapable(!reduced && !mobile);
  }, []);

  // STABILITY: only mount the WebGL canvas while the hero is actually near
  // the viewport. Rendering it continuously for the entire page's scroll
  // session (a very long page) was the main source of the scroll
  // freeze/black-screen — this guarantees zero GPU cost once scrolled away,
  // and it comes back automatically if the visitor scrolls back up.
  useEffect(() => {
    if (!capable || !wrapRef.current) return;
    const el = wrapRef.current;
    const observer = new IntersectionObserver(([entry]) => setNearView(entry.isIntersecting), {
      rootMargin: "50% 0px 50% 0px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [capable]);

  // cursor-parallax: subtle tilt (few degrees, applied inside the 3D scene)
  // that reacts to pointer position independent of scroll — desktop only.
  useEffect(() => {
    if (!capable) return;
    const onMove = (e: PointerEvent) => {
      phoneState.pointerX = (e.clientX / window.innerWidth) * 2 - 1;
      phoneState.pointerY = (e.clientY / window.innerHeight) * 2 - 1;
      phoneState.invalidate?.();
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [capable]);

  useMotionValueEvent(progress, "change", (v) => {
    phoneState.progress = v;
    phoneState.invalidate?.();
  });

  if (!capable) {
    // Mobile / reduced-motion fallback: the same screenshot, framed flat and
    // static — no 3D, no rotation, no dependency on scroll math.
    return (
      <div className={styles.heroPhoneFallback}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/v2/screens/dnes.png" alt="Karta Dnes v klientskom portáli FitPilot" />
      </div>
    );
  }

  return (
    <div ref={wrapRef} className={styles.heroPhoneCanvas} aria-hidden="true">
      {nearView && <PhoneCanvasInner />}
    </div>
  );
}
