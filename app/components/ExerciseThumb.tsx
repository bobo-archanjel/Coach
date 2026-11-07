"use client";

import Image from "next/image";
import exerciseThumbStyles from "./exerciseThumb.module.css";
import { useSkinStyles } from "./uiSkin";

const DumbbellIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4 9v6M2 10v4M20 9v6M22 10v4M6 12h12"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <rect x="6" y="8" width="4" height="8" rx="1" stroke="currentColor" strokeWidth="1.8" />
    <rect x="14" y="8" width="4" height="8" rx="1" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

/**
 * Malý štvorcový náhľad cviku (Free Exercise DB) — fallback ikona, ak obrázok chýba.
 * Rozmer je priamo na <img> (width/height), nie `fill`: `fill` je absolútne
 * pozicovaný na 100 % rodiča a malý ho drží len `position: relative` z CSS modulu.
 * Keď sa ten štýl v prehliadači neaplikoval (iPhone, výber cviku v portáli),
 * náhľad sa roztiahol na celú obrazovku. Takto má obrázok veľkosť vždy.
 */
export function ExerciseThumb({ src, alt, size = 32 }: { src: string | null; alt: string; size?: number }) {
  const styles = useSkinStyles("exerciseThumb", exerciseThumbStyles);
  if (!src) {
    return (
      <span className={styles.thumbFallback} style={{ width: size, height: size }} aria-hidden="true">
        <DumbbellIcon />
      </span>
    );
  }
  return (
    <span className={styles.thumb} style={{ width: size, height: size }}>
      <Image src={src} alt={alt} width={size} height={size} className={styles.thumbImg} />
    </span>
  );
}
