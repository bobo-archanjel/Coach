"use client";

import { useEffect, useRef } from "react";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { sceneState } from "../lib/sceneState";

// Xbot.glb — voľne dostupný Mixamo/three.js ukážkový rig (three.js examples repo,
// public/models/Xbot.glb) s klipmi idle/walk/run/agree/headShake/sad_pose/sneak_pose.
// Materiály sú prepísané na coral wireframe (brand --iron-red) namiesto pôvodnej
// kože/oblečenia — "motion capture" postava ako grafický, nie fotorealistický prvok.
const MODEL_URL = "/models/Xbot.glb";

/** Ktorá animácia beží v ktorej sekcii — index podľa SECTIONS v sceneState.ts. */
const CLIP_BY_SECTION = ["idle", "walk", "run", "run", "run", "agree"];

export function Athlete({ position = [0, -1.05, 0] as [number, number, number] }) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(MODEL_URL);
  const { actions } = useAnimations(animations, group);
  const currentClip = useRef<string | null>(null);

  // Coral wireframe materiál na celom modeli — jeden krát pri načítaní.
  useEffect(() => {
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.material = new THREE.MeshBasicMaterial({
          color: new THREE.Color("#e0402a"),
          wireframe: true,
          transparent: true,
          opacity: 0.85,
        });
      }
    });
  }, [scene]);

  // Spustí idle animáciu hneď (kým sa nespustí prvý crossfade zo sceneState).
  useEffect(() => {
    const idle = actions.idle;
    idle?.reset().fadeIn(0.4).play();
    currentClip.current = "idle";
    return () => {
      idle?.fadeOut(0.2);
    };
  }, [actions]);

  useFrame(() => {
    if (!group.current) return;

    // Crossfade na klip zodpovedajúci aktuálnej sekcii (len keď sa reálne zmenil).
    const clipName = CLIP_BY_SECTION[sceneState.section] ?? "idle";
    if (clipName !== currentClip.current) {
      const next = actions[clipName];
      const prev = currentClip.current ? actions[currentClip.current] : null;
      prev?.fadeOut(0.5);
      next?.reset().fadeIn(0.5).play();
      currentClip.current = clipName;
    }

    // Jemný parallax podľa myši + mierne otočenie podľa scroll progressu.
    const targetY = sceneState.mouse.x * 0.35 + sceneState.progress * Math.PI * 0.6;
    group.current.rotation.y += (targetY - group.current.rotation.y) * 0.05;

    // Viditeľnosť: postava dominuje v hero/zones/final, ustúpi telefónu v product/ai/pricing.
    const visibleSections = [0, 1, 5];
    const targetOpacity = visibleSections.includes(sceneState.section) ? 1 : 0;
    group.current.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.material instanceof THREE.MeshBasicMaterial) {
        mesh.material.opacity += (targetOpacity * 0.85 - mesh.material.opacity) * 0.06;
      }
    });
  });

  return (
    <group ref={group} position={position} scale={1.15}>
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload(MODEL_URL);
