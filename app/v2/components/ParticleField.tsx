"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { sceneState } from "../lib/sceneState";

const COLORS = ["#e0402a", "#e6b23a", "#4c7a5e"]; // coral / amber / moss — presne DESIGN.md palette

/** Ambientné energetické pole bodov v brand farbách — atmosféra za
    atlétom/telefónom, reaguje na myš (parallax) a scroll (hustota/rýchlosť). */
export function ParticleField({ count = 900 }: { count?: number }) {
  const points = useRef<THREE.Points>(null);

  const [positions, colors] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 14;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 14;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 8 - 2;
      c.set(COLORS[i % COLORS.length]);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    return [pos, col];
  }, [count]);

  useFrame((state, delta) => {
    if (!points.current) return;
    points.current.rotation.y += delta * 0.02 + sceneState.mouse.x * 0.001;
    points.current.rotation.x += sceneState.mouse.y * 0.0006;
    // Final sekcia (5) = "výbuch" — pole sa mierne roztiahne a zrýchli rotáciu (oslava CTA).
    const boost = sceneState.section === 5 ? 1.6 : 1;
    points.current.scale.setScalar(THREE.MathUtils.lerp(points.current.scale.x, boost, 0.03));
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.05} vertexColors transparent opacity={0.75} sizeAttenuation depthWrite={false} />
    </points>
  );
}
