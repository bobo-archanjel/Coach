"use client";

// Split from PhoneHero.tsx so three.js/@react-three/fiber/drei are only ever
// downloaded on the devices that actually render the 3D phone — dynamically
// imported with ssr:false and no-op on mobile/reduced-motion, which get the
// plain static screenshot fallback instead (see PhoneHero.tsx).
//
// STABILITY: frameloop="demand" — the canvas does NOT render continuously at
// 60fps for the entire page-scroll session (that sustained GPU load across a
// very long page, stacked on Lenis's own per-frame work, is what produced the
// scroll freeze/black-screen). Instead every frame is invalidated explicitly
// only while the phone is actually still easing toward its target rotation —
// once it settles, rendering stops completely until the next scroll or
// pointer move. PhoneHero additionally unmounts this component outside the
// viewport, so the WebGL context does not exist at all once scrolled away.
import { Suspense, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RoundedBox, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { phoneState } from "../lib/phoneState";

const SETTLE_EPSILON = 0.0008;

function PhoneMesh() {
  const groupRef = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const screenTex = useTexture("/v2/screens/dnes.png");
  screenTex.colorSpace = THREE.SRGBColorSpace;
  // the screen is viewed at an oblique angle once rotated — without
  // anisotropic filtering that minifies unevenly and the UI text turns to
  // mush; this is the single biggest legibility fix available here.
  screenTex.anisotropy = gl.capabilities.getMaxAnisotropy();
  screenTex.needsUpdate = true;

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const p = phoneState.progress;
    // scroll-driven turn + settle, plus a subtle cursor-parallax tilt layered
    // on top (a couple of degrees max) — the hero's fastest-reacting layer,
    // independent of scroll position.
    const targetY = THREE.MathUtils.degToRad(22 - p * 30 + phoneState.pointerX * 5);
    const targetX = THREE.MathUtils.degToRad(-4 + p * 6 - phoneState.pointerY * 4);
    const targetZ = -0.4 + p * 0.5;
    const lerpSpeed = Math.min(1, delta * 4.5);
    const dy = targetY - group.rotation.y;
    const dx = targetX - group.rotation.x;
    const dz = targetZ - group.position.z;
    group.rotation.y += dy * lerpSpeed;
    group.rotation.x += dx * lerpSpeed;
    group.position.z += dz * lerpSpeed;
    // keep re-rendering only while still visibly easing toward the target;
    // once settled, let the canvas go idle instead of rendering forever.
    if (Math.abs(dy) + Math.abs(dx) + Math.abs(dz) > SETTLE_EPSILON) invalidate();
  });

  return (
    <group ref={groupRef}>
      {/* thin accent rim, very slightly larger than the body, sits behind it */}
      <RoundedBox args={[1.74, 3.54, 0.08]} radius={0.18} smoothness={2} position={[0, 0, -0.04]}>
        <meshStandardMaterial color="#e0402a" metalness={0.5} roughness={0.4} />
      </RoundedBox>
      <RoundedBox args={[1.7, 3.5, 0.14]} radius={0.16} smoothness={2}>
        <meshStandardMaterial color="#141210" metalness={0.3} roughness={0.4} />
      </RoundedBox>
      <mesh position={[0, 0, 0.075]}>
        <planeGeometry args={[1.54, 3.28]} />
        <meshBasicMaterial map={screenTex} toneMapped={false} />
      </mesh>

      {/* camera notch — the single detail that reads "phone" instead of
          "rounded card" at a glance */}
      <RoundedBox args={[0.34, 0.1, 0.02]} radius={0.05} smoothness={2} position={[0, 1.56, 0.086]}>
        <meshStandardMaterial color="#050505" metalness={0.2} roughness={0.6} />
      </RoundedBox>
      <mesh position={[0.09, 1.56, 0.096]}>
        <circleGeometry args={[0.028, 16]} />
        <meshStandardMaterial color="#1c2b3a" metalness={0.8} roughness={0.15} emissive="#0a1622" emissiveIntensity={0.4} />
      </mesh>

      {/* side buttons — power (right) + volume rocker (left) */}
      <RoundedBox args={[0.03, 0.34, 0.09]} radius={0.012} smoothness={1} position={[0.865, 0.55, 0]}>
        <meshStandardMaterial color="#e0402a" metalness={0.6} roughness={0.35} />
      </RoundedBox>
      <RoundedBox args={[0.03, 0.22, 0.09]} radius={0.012} smoothness={1} position={[-0.865, 0.75, 0]}>
        <meshStandardMaterial color="#e0402a" metalness={0.6} roughness={0.35} />
      </RoundedBox>
      <RoundedBox args={[0.03, 0.22, 0.09]} radius={0.012} smoothness={1} position={[-0.865, 0.42, 0]}>
        <meshStandardMaterial color="#e0402a" metalness={0.6} roughness={0.35} />
      </RoundedBox>
    </group>
  );
}

export default function PhoneCanvasInner() {
  return (
    <Canvas
      camera={{ position: [0, 0, 4.4], fov: 50 }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      dpr={[1, 2]}
      frameloop="demand"
      onCreated={({ gl, invalidate }) => {
        // expose invalidate() to the plain (non-R3F) code in PhoneHero, which
        // lives outside the Canvas and drives scroll/pointer updates.
        phoneState.invalidate = invalidate;
        // resilience: a lost context (driver reset, GPU throttling under
        // sustained load) used to leave a permanently black canvas — recover
        // instead of leaving it dead.
        const canvasEl = gl.domElement;
        const onLost = (e: Event) => e.preventDefault();
        const onRestored = () => invalidate();
        canvasEl.addEventListener("webglcontextlost", onLost, false);
        canvasEl.addEventListener("webglcontextrestored", onRestored, false);
      }}
    >
      <ambientLight intensity={0.65} />
      <directionalLight position={[2.5, 3, 3]} intensity={1.1} />
      <pointLight position={[-2, -1, 2]} intensity={0.5} color="#e0402a" />
      <Suspense fallback={null}>
        <PhoneMesh />
      </Suspense>
    </Canvas>
  );
}
