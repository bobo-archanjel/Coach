"use client";

import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Athlete } from "./Athlete";
import { PhoneMockup } from "./PhoneMockup";
import { ParticleField } from "./ParticleField";
import { sceneState } from "../lib/sceneState";
import styles from "../page.module.css";

/**
 * Jedna trvalá `fixed` Canvas vrstva za celým obsahom (feature/security#2,
 * "všetko naraz" smer) — atlét (mocap wireframe), 3D telefón s reálnymi
 * screenshotmi appky a ambientné particle pole, všetko riadené `sceneState`
 * (nastavuje ho GSAP ScrollTrigger v page.tsx, nie React state — scéna
 * číta 60×/s, re-render by ju len sekal). Vypnutá úplne na mobile a pri
 * `prefers-reduced-motion` (adaptívna stratégia, vyžiadané) — DOM/GSAP
 * scrollytelling tam beží ďalej bez WebGL nákladu.
 */
export function Scene3D() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = window.matchMedia("(max-width: 860px)").matches;
    setEnabled(!reduced && !mobile);

    const onMove = (e: PointerEvent) => {
      sceneState.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      sceneState.mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  if (!enabled) return null;

  return (
    <div className={styles.sceneLayer} aria-hidden="true">
      <Canvas camera={{ position: [0, 0.4, 5.5], fov: 42 }} gl={{ antialias: true, alpha: true }} dpr={[1, 1.75]}>
        {/* Žiadny Environment/HDR (drei preset ťahá externý súbor z raw.githack.com —
            koliduje s vlastnou CSP, zbytočná externá závislosť pre wireframe/coral
            materiály, ktoré na image-based lighting nespoliehajú). Priame svetlá stačia. */}
        <ambientLight intensity={0.7} />
        <directionalLight position={[3, 4, 5]} intensity={1.3} color="#f3efe6" />
        <pointLight position={[-3, -2, 2]} intensity={0.4} color="#e0402a" />
        <Suspense fallback={null}>
          {/* Posunutá doprava — hero nadpis (vľavo, viď page.module.css @860px+)
              potrebuje čistú zónu, inak text a postava kolidujú vizuálne. */}
          <Athlete position={[1.9, -1.15, 0]} />
          {/* Y posunuté nižšie — product caption (page.module.css .productSection)
              sedí hore v sekcii, telefón dole, nech sa nekryjú (predtým oboje
              v strede = text cez displej telefónu, nečitateľné). */}
          <PhoneMockup position={[0, -0.9, 0.6]} />
          <ParticleField />
        </Suspense>
      </Canvas>
    </div>
  );
}
