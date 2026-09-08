"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { sceneState } from "../lib/sceneState";

// Vlastný GLSL shader (žiadna nová závislosť — three.js ShaderMaterial je
// súčasť balíka, ktorý už appka má). Toto je vizuálny podpis rebuildu #3:
// nekonečná scrolling HUD mriežka + mouse-glow + jemný scanline, výhradne v
// brand farbách (ink/iron-red/plate-yellow) — "rok 3500" pocit bez jediného
// nového npm balíka a bez fotorealistických assetov.
const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uProgress;
  uniform vec2 uMouse;
  uniform vec2 uResolution;

  // Štylizovaný EKG impulz — plochá základňa s ostrým výkyvom raz za periódu.
  // Fitness/vitals motív v pozadí namiesto čisto abstraktnej HUD mriežky
  // (na výslovnú žiadosť: pozadie má byť spojené s fitnesom, nie len s AI).
  float ekgPulse(float x) {
    float p = fract(x);
    float spike = smoothstep(0.46, 0.5, p) * smoothstep(0.54, 0.5, p);
    float dip = smoothstep(0.56, 0.6, p) * smoothstep(0.68, 0.6, p) * 0.35;
    return spike - dip;
  }

  void main() {
    vec2 uv = vUv;
    vec3 ink = vec3(0.0706, 0.0667, 0.0627);
    vec3 iron = vec3(0.8784, 0.2510, 0.1647);
    vec3 yellow = vec3(0.9020, 0.6980, 0.2275);

    vec3 col = ink;

    // Scrolling HUD mriežka — posúva sa s časom a so scroll progressom.
    float scale = 44.0;
    vec2 grid = uv * uResolution / scale;
    grid.y += uTime * 0.5 + uProgress * 26.0;
    vec2 gridFrac = fract(grid);
    vec2 gridDist = min(gridFrac, 1.0 - gridFrac);
    float line = smoothstep(0.04, 0.0, min(gridDist.x, gridDist.y));
    col = mix(col, iron, line * 0.11);

    // Mouse-reaktívna žiara.
    vec2 mouseP = uMouse;
    vec2 uvP = uv;
    float aspect = uResolution.x / uResolution.y;
    mouseP.x *= aspect;
    uvP.x *= aspect;
    float d = distance(uvP, mouseP);
    float glow = smoothstep(0.55, 0.0, d);
    col += iron * glow * 0.14;

    // Jemný scanline (CRT/HUD pocit) + plate-yellow prímes.
    float scan = sin(uv.y * uResolution.y * 0.85 - uTime * 36.0) * 0.5 + 0.5;
    col += yellow * scan * 0.007;

    // EKG "sweep" — tenký pulzujúci pás putujúci zhora nadol, s výkyvom
    // pripomínajúcim tep srdca. Fitness/vitals motív, nie dominantný prvok.
    float bandY = fract(uTime * 0.045);
    float wave = ekgPulse(uv.x * 5.0 + uTime * 0.3);
    float lineY = bandY + wave * 0.018;
    float band = smoothstep(0.006, 0.0, abs(uv.y - lineY));
    float edgeFade = smoothstep(0.0, 0.06, bandY) * smoothstep(1.0, 0.94, bandY);
    col += iron * band * 0.55 * edgeFade;

    // Vinetácia — stred jasnejší, okraje potlačené.
    float vig = smoothstep(0.95, 0.2, distance(uv, vec2(0.5)));
    col *= mix(0.72, 1.0, vig);

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function ShaderBackdrop() {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { viewport, camera, size } = useThree();
  const depthZ = -4;

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uResolution: { value: new THREE.Vector2(size.width, size.height) },
    }),
    [size.width, size.height],
  );

  useFrame((state) => {
    if (!matRef.current || !meshRef.current) return;
    const v = viewport.getCurrentViewport(camera, [0, 0, depthZ]);
    meshRef.current.scale.set(v.width, v.height, 1);
    matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    matRef.current.uniforms.uProgress.value = sceneState.progress;
    matRef.current.uniforms.uMouse.value.set(sceneState.mouse.x * 0.5 + 0.5, sceneState.mouse.y * -0.5 + 0.5);
    matRef.current.uniforms.uResolution.value.set(size.width, size.height);
  });

  return (
    <mesh ref={meshRef} position={[0, 0, depthZ]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial ref={matRef} uniforms={uniforms} vertexShader={VERTEX} fragmentShader={FRAGMENT} depthWrite={false} />
    </mesh>
  );
}
