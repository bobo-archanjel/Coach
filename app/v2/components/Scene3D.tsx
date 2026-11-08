"use client";

import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ParticleField } from "./ParticleField";
import { ShaderBackdrop } from "./ShaderBackdrop";
import { sceneState } from "../lib/sceneState";
import styles from "../page.module.css";

/**
 * Jedna trvalá `fixed` Canvas vrstva za celým obsahom — čisto ambientná:
 * vlastný GLSL HUD-grid + EKG shader (ShaderBackdrop) a particle pole.
 * Doslovný fitness objekt (mocap atlét, potom wireframe barbell/kettlebell)
 * bol z tejto vrstvy odstránený — tri po sebe idúce pokusy nepôsobili dobre
 * (spätná väzba: "vyzerá to zle/otrasne", "nedá sa povedať že je to
 * kettlebell"). Konkrétny "dôkaz produktu" teraz nesie `HeroShowcase`
 * (reálne screenshoty appky, DOM/CSS parallax) priamo v hero sekcii —
 * bezpečnejšia, overiteľná cesta než ďalší 3D model. Táto vrstva ostáva len
 * tichá atmosféra v pozadí. Vypnutá úplne na mobile a pri
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
        <ShaderBackdrop />
        <ParticleField />
      </Canvas>
    </div>
  );
}
