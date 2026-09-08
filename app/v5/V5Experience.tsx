"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { LogoMark } from "../components/LogoMark";
import { SCENES } from "./lib/scenes";
import styles from "./page.module.css";

declare global {
  interface Window {
    mountScrollWorld?: (container: HTMLElement, config: Record<string, unknown>) => void;
  }
}

/*
 * IMPECCABLE DIRECTION CONTRACT — app/v5, "Posilňovňa" (scroll-world rebuild)
 *
 * THESIS: the prior /v5 build (a hand-rolled Three.js gym of primitive
 * boxes/cylinders/torus geometry) read as a cheap tech demo, not a SaaS
 * landing page — flat lighting, no real materials, no atmosphere. This
 * rebuild replaces it entirely with the scroll-world skill's approach: real
 * AI-generated photography and video of an actual premium boutique gym
 * (Higgsfield gpt_image_2 for the still, seedance_2_0 for the camera-flight
 * video chain), scrubbed by scroll position through a portable vanilla-JS
 * engine (public/v5/scrub-engine.js). Scroll no longer drives a WebGL
 * camera through procedural geometry — it drives currentTime on a
 * pre-rendered cinematic dolly shot. This is the same technique behind
 * Apple's scroll-through product pages.
 * STRUCTURE: five consolidated scenes (down from the original nine-station
 * mapping to fit the agreed credit budget, still covering every product
 * domain) — reception/hero, training floor (workout logging + plan builder
 * combined), nutrition bar, AI coach's glass office, and register+mirror
 * (pricing + final CTA). One continuous forward walkthrough (scroll-world
 * skill's "Architecture A": each leg starts from the ACTUAL last rendered
 * frame of the previous leg — never the original still — so every seam is
 * frame-identical and the camera never reverses direction; no connector
 * clips are needed at all). See lib/scenes.ts for the exact copy per scene.
 * MOTION: `public/v5/scrub-engine.js` (copied verbatim from the scroll-world
 * skill) maps scroll position to `video.currentTime` on a blob-loaded clip
 * per scene, with a short crossfade at each seam and a `linger` ease so the
 * camera settles mid-scene exactly while the copy peaks. No camera code of
 * ours runs at all — the "camera" is the pre-rendered video, which is what
 * makes the motion itself look genuinely cinematic instead of proceduralally
 * animated.
 * STABILITY: zero WebGL, zero per-frame 3D scene graph — the engine seeks a
 * <video> element, which is orders of magnitude cheaper than driving a
 * Three.js render loop, and it loads each clip as a Blob (always fully
 * seekable, independent of whether the host serves byte-range requests).
 * FINISH: per your explicit direction, mobile does NOT load the video chain
 * at all — below the engine's own ≤860px/coarse-pointer breakpoint this
 * component renders a plain, fully responsive stacked page (stills + copy,
 * normal document flow) instead of mounting the engine, so phones never pay
 * for the video weight. Desktop `prefers-reduced-motion` is handled inside
 * the engine itself (stills cross-dissolve, no video ever loads).
 */

const CLIP_BASE = "/v5/vid";
const IMG_BASE = "/v5/img";

export function V5Experience() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [mobile, setMobile] = useState<boolean | null>(null);
  const [engineReady, setEngineReady] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px), (hover: none) and (pointer: coarse)");
    const check = () => setMobile(mq.matches);
    check();
    mq.addEventListener("change", check);
    return () => mq.removeEventListener("change", check);
  }, []);

  useEffect(() => {
    if (mobile !== false || !engineReady || !stageRef.current) return;
    if (!window.mountScrollWorld) return;
    window.mountScrollWorld(stageRef.current, {
      brand: { name: "FitPilot", href: "/" },
      nav: true,
      hint: "scroll pre prehliadku",
      diveScroll: 1.5,
      cta: { label: "Skúsiť zadarmo", href: "/prihlasenie#register" },
      sections: SCENES.map((s, i) => ({
        id: s.id,
        label: s.label,
        still: `${IMG_BASE}/scene${i + 1}.jpg`,
        clip: `${CLIP_BASE}/leg${i + 1}.mp4`,
        accent: s.accent,
        scroll: i === 0 || i === SCENES.length - 1 ? 1.8 : 1.4,
        linger: 0.35,
        eyebrow: s.eyebrow,
        title: s.title,
        body: s.body,
        tags: s.tags,
        ...(s.cta ? { cta: { primary: s.cta } } : {}),
      })),
      // Architecture A (continuous forward take, scroll-world skill Step 4):
      // no connector clips — the legs themselves chain seamlessly since each
      // one starts from the previous one's actual rendered last frame.
      connectors: new Array(SCENES.length - 1).fill(null),
    });
  }, [mobile, engineReady]);

  if (mobile === null) {
    return <div className={styles.worldRoot} />;
  }

  if (mobile) {
    return (
      <div className={styles.mobilePage}>
        <nav className={styles.mobileNav}>
          <Link href="/" className={styles.mobileBrand}>
            <LogoMark className={styles.mobileLogo} />
            FitPilot
          </Link>
          <Link href="/prihlasenie#register" className={styles.mobileBtn}>
            Skúsiť zadarmo
          </Link>
        </nav>
        {SCENES.map((s, i) => (
          <section key={s.id} className={styles.mobileSection} style={{ ["--accent-color" as string]: s.accent }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${IMG_BASE}/scene${i + 1}.jpg`} alt="" />
            <div className={styles.mobileSectionBody}>
              <span className={styles.mobileEyebrow}>{s.eyebrow}</span>
              <h2 className={styles.mobileTitle}>{s.title}</h2>
              <p className={styles.mobileBody}>{s.body}</p>
              <ul className={styles.mobileTags}>
                {s.tags.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              {s.cta && (
                <Link href={s.cta.href} className={styles.mobileCta}>
                  {s.cta.label}
                </Link>
              )}
            </div>
          </section>
        ))}
        <footer className={styles.mobileFooter}>
          <p>
            Interná testovacia varianta landing page (app/v5) — bežná stránka ostáva na{" "}
            <Link href="/">fitpilot.sk</Link>.
          </p>
        </footer>
      </div>
    );
  }

  return (
    <>
      <Script src="/v5/scrub-engine.js" strategy="afterInteractive" onLoad={() => setEngineReady(true)} />
      <div ref={stageRef} className={styles.worldRoot} />
    </>
  );
}
