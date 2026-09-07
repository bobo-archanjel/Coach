/*
 * IMPECCABLE DIRECTION CONTRACT — feature/security#2, /v2 landing variant (v2)
 *
 * THESIS: this page is a full scrollytelling experience built on the same
 * "wearable recap" world as v1, now maximally committed — a live 3D mocap
 * athlete, a 3D phone rendering the app's real screens, and an ambient
 * particle field, all driven by scroll, not a static page with animated cards.
 * OWN-WORLD: unchanged FitPilot palette/Inter — the athlete renders as coral
 * wireframe (brand color as material, not literal skin), particles carry the
 * three semantic colors (coral/amber/moss), the phone shows real app screens.
 * STORY: a trainer watches their coaching practice rendered as a live,
 * physical, in-motion thing — not a deck of feature cards — and starts a
 * trial to get that same fluency for real.
 * FIRST VIEWPORT: pinned hero — athlete idle in the 3D layer behind, headline
 * split-text reveals character by character as the pin scrubs, small ring
 * badge (14 days) top area, CTA fades in last.
 * FORM: GSAP + ScrollTrigger + SplitText for scroll choreography, Lenis for
 * inertia, React Three Fiber/drei for the 3D layer (athlete, phone, particles) —
 * `motion` package from the prior /v2 build is unused here by design (one
 * scroll-orchestration system, not two competing ones).
 * FINISH: unreviewed and undocumented is unfinished — verified via tsc/build/
 * e2e plus manual desktop+mobile screenshot inspection (adaptive: 3D layer
 * disabled on mobile/reduced-motion, DOM/GSAP choreography stays).
 */
import type { Metadata } from "next";
import { V2Experience } from "./V2Experience";

export const metadata: Metadata = {
  title: "FitPilot — náhľad v2 (interné testovanie)",
  robots: { index: false, follow: false },
};

export default function LandingV2() {
  return <V2Experience />;
}
