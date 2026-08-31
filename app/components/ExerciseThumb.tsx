"use client";

import Image from "next/image";
import styles from "./exerciseThumb.module.css";

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

/** Malý štvorcový náhľad cviku (Free Exercise DB) — fallback ikona, ak obrázok chýba. */
export function ExerciseThumb({ src, alt, size = 32 }: { src: string | null; alt: string; size?: number }) {
  if (!src) {
    return (
      <span className={styles.thumbFallback} style={{ width: size, height: size }} aria-hidden="true">
        <DumbbellIcon />
      </span>
    );
  }
  return (
    <span className={styles.thumb} style={{ width: size, height: size }}>
      <Image src={src} alt={alt} fill sizes={`${size}px`} className={styles.thumbImg} unoptimized />
    </span>
  );
}
