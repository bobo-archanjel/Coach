"use client";

import { useRef } from "react";
import { motion, useInView } from "motion/react";

/** Kreslená sparkline (ilustračná, nie reálne dáta — appka zatiaľ nemá
    zákazníkov na reálne štatistiky, PRODUCT.md "Evidence on Hand"). Slúži
    len ako vizuálny motív "readout" obrazovky, nikde sa netvári ako číslo. */
export function Sparkline({ points, color = "var(--iron-red)" }: { points: string; color?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true });

  return (
    <svg ref={ref} viewBox="0 0 280 80" width="100%" height="80" preserveAspectRatio="none" aria-hidden="true">
      <motion.polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={inView ? { pathLength: 1 } : {}}
        transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
      />
    </svg>
  );
}
