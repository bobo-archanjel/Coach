"use client";

import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Athlete } from "./Athlete";
import { ParticleField } from "./ParticleField";
import { ShaderBackdrop } from "./ShaderBackdrop";
import { sceneState } from "../lib/sceneState";
import styles from "../page.module.css";

/**
 * Jedna trvalá `fixed` Canvas vrstva za celým obsahom — vlastný GLSL HUD-grid
 * shader (ShaderBackdrop, vizuálny podpis rebuildu #3, "rok 3500"), mocap
 * atlét (coral wireframe) a ambientné particle pole, riadené `sceneState`
 * (nastavuje ho GSAP ScrollTrigger vo V2Experience, nie React state — scéna
 * číta 60×/s, re-render by ju len sekal). Vypnutá úplne na mobile a pri
 * `prefers-reduced-motion` — DOM/GSAP scrollytelling tam beží ďalej bez
 * WebGL nákladu.
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
        <ambientLight intensity={0.7} />
        <directionalLight position={[3, 4, 5]} intensity={1.3} color="#f3efe6" />
        <pointLight position={[-3, -2, 2]} intensity={0.4} color="#e0402a" />
        <ShaderBackdrop />
        <Suspense fallback={null}>
          <Athlete position={[1.9, -1.15, 0]} />
          <ParticleField />
        </Suspense>
      </Canvas>
    </div>
  );
}
