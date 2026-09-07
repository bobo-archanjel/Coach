"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { sceneState } from "../lib/sceneState";

// Reálne snímky appky (feature/security#2) — nie fabrikovaný obsah, presne to,
// čo appka zobrazuje (?preview= dev náhľady, žiadne session dáta).
const SCREENS = ["/v2/screens/dnes.png", "/v2/screens/dennik.png", "/v2/screens/chat.png"];

/** 3D "telefón" (zaoblený box) s textúrou skutočnej obrazovky appky na prednej stene.
    Textúra sa prepína podľa sekcie (product = dnes, ai = chat, pricing = dennik). */
export function PhoneMockup({ position = [0, 0, 0] as [number, number, number] }) {
  const group = useRef<THREE.Group>(null);
  const textures = useTexture(SCREENS);
  const currentIdx = useRef(0);
  const meshRef = useRef<THREE.Mesh>(null);

  textures.forEach((t) => {
    t.colorSpace = THREE.SRGBColorSpace;
  });

  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ map: textures[0], roughness: 0.35, metalness: 0.1 }),
    [textures],
  );

  useFrame((state) => {
    if (!group.current) return;

    // 2=product, 3=ai, 4=pricing → viditeľný telefón, inak zmizne (scale/opacity).
    const visibleSections = [2, 3, 4];
    const visible = visibleSections.includes(sceneState.section);
    const targetScale = visible ? 1 : 0.001;
    const s = group.current.scale.x + (targetScale - group.current.scale.x) * 0.08;
    group.current.scale.setScalar(s);

    // Pri vstupe do "ai" sekcie prepni na chat screenshot, "pricing" na denník.
    const idx = sceneState.section === 3 ? 2 : sceneState.section === 4 ? 1 : 0;
    if (idx !== currentIdx.current) {
      material.map = textures[idx];
      material.needsUpdate = true;
      currentIdx.current = idx;
    }

    // Predtým nekonečná rotácia (rotation.y += delta*...) — obrazovka sa
    // pravidelne odvrátila od kamery a bola vidno len zadná strana boxu
    // (skutočný bug, odhalený screenshotom). Oscilácia drží telefón vždy
    // takmer čelom ku kamere, len jemne "živý" pohyb + parallax podľa myši.
    const t = state.clock.elapsedTime;
    group.current.rotation.y = Math.sin(t * 0.4) * 0.35 + sceneState.mouse.x * 0.25;
    group.current.rotation.x = Math.cos(t * 0.3) * 0.06 + sceneState.mouse.y * 0.12;
    group.current.position.y = position[1] + Math.sin(t) * 0.08;
  });

  return (
    <group ref={group} position={position} scale={0.001}>
      <RoundedBox args={[1.6, 3.3, 0.15]} radius={0.12} smoothness={4}>
        <meshStandardMaterial color="#1e1917" roughness={0.4} />
      </RoundedBox>
      <mesh ref={meshRef} position={[0, 0, 0.076]} material={material}>
        <planeGeometry args={[1.42, 3.08]} />
      </mesh>
    </group>
  );
}

useTexture.preload(SCREENS[0]);
