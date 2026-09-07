"use client";

import { useRef } from "react";
import { gsap } from "gsap";
import styles from "../page.module.css";

/**
 * Feature karta s cursor-aware 3D tilt + coral glow, ktorý sleduje pointer
 * (CSS custom properties `--mx`/`--my` menené priamo v mousemove handleri,
 * nie React state — glow beží pri každom frame pohybu myši, re-render by ho
 * trhal). Tilt cez GSAP `quickTo` na rotationX/Y, vypnuté na touch/reduced
 * motion (samotný stagger-reveal beží aj tam, len bez tiltu).
 */
export function FeatureCard({
  index,
  title,
  copy,
  tags,
  tone,
}: {
  index: number;
  title: string;
  copy: string;
  tags: string[];
  tone: "coral" | "amber" | "moss" | "steel";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const quick = useRef<{ x: gsap.QuickToFunc; y: gsap.QuickToFunc } | null>(null);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse") return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    el.style.setProperty("--mx", `${px * 100}%`);
    el.style.setProperty("--my", `${py * 100}%`);

    if (!quick.current) {
      quick.current = {
        x: gsap.quickTo(el, "rotationY", { duration: 0.4, ease: "power2.out" }),
        y: gsap.quickTo(el, "rotationX", { duration: 0.4, ease: "power2.out" }),
      };
    }
    quick.current.x((px - 0.5) * 10);
    quick.current.y((0.5 - py) * 8);
  };

  const onLeave = () => {
    quick.current?.x(0);
    quick.current?.y(0);
  };

  return (
    <div
      ref={ref}
      className={`v2-feature-card ${styles.featureCard} ${styles[`tone${tone[0].toUpperCase()}${tone.slice(1)}`]}`}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={{ perspective: 800 }}
    >
      <span className={styles.featureIndex}>{String(index + 1).padStart(2, "0")}</span>
      <h3>{title}</h3>
      <p>{copy}</p>
      <div className={styles.featureTagRow}>
        {tags.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
    </div>
  );
}
