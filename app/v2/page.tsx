/*
 * IMPECCABLE DIRECTION CONTRACT — feature/front-end, /v2 landing variant, rebuild #3
 *
 * THESIS: "landing page ako z roku 3500" — a HUD/command-console reading of
 * the same FitPilot product, not a re-skin of the previous scrollytelling
 * build. A live GLSL grid shader, a crosshair cursor, a kinetic ticker and
 * corner-bracketed "readout" panels replace plain cards; every section still
 * says in plain words what the product does — spectacle serves comprehension
 * here, it doesn't replace it.
 * OWN-WORLD: unchanged FitPilot palette (ink/paper/iron-red/plate-yellow/
 * moss/steel) — the futurism comes from HUD *language* (brackets, mono
 * labels, scanlines, grid), never from a new brand color. Inter stays the
 * reading typeface for headlines/body (comprehension); JetBrains Mono is
 * added *only* for labels/eyebrows/numeric readouts/nav — a deliberate
 * two-voice system (human copy vs. machine readout), loaded via next/font
 * inside this route only, no change to the site's root font.
 * STORY: a trainer opens what reads like a live operating console for their
 * coaching practice — clients, training, nutrition and AI rendered as
 * telemetry, not brochure copy — and the CTA is the console's own "boot"
 * action into the real app.
 * FIRST VIEWPORT: shader-grid backdrop with a mouse-reactive glow, a kinetic
 * ticker of value props, SplitText headline that autoplays the instant the
 * preloader clears, mocap athlete rendered as a HUD wireframe silhouette.
 * FORM: GSAP + ScrollTrigger + SplitText (pin/scrub/stagger), Lenis inertia,
 * a custom GLSL ShaderMaterial (no new dependency — three.js ships it) for
 * the grid/glow backdrop, React Three Fiber/drei for the athlete + particle
 * layer, a custom crosshair cursor with per-element hover labels
 * (`data-cursor`). Pricing stays the calmest section on the page — plain
 * fade, no pin/scrub, no cursor tricks — a buyer must read it without a
 * fight.
 * FINISH: reduced-motion strips every pin/scrub/parallax/marquee/cursor/3D
 * layer down to a plain opacity+8px fade with the native cursor restored;
 * mobile (<768px) disables the 3D/shader layer and turns the pinned
 * horizontal gallery into a native scroll-snap row. Verified via tsc/build/
 * e2e plus desktop+mobile+reduced-motion screenshot inspection.
 */
import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { V2Experience } from "./V2Experience";

const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-hud-mono" });

export const metadata: Metadata = {
  title: "FitPilot — náhľad v2 (interné testovanie)",
  robots: { index: false, follow: false },
};

export default function LandingV2() {
  return (
    <div className={mono.variable}>
      <V2Experience />
    </div>
  );
}
