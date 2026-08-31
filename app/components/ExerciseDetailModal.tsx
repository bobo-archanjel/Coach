"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { ExerciseDetail } from "@/lib/exercises";
import { displayExerciseName } from "@/lib/exercises";
import styles from "./exerciseDetail.module.css";

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
const ChevronIcon = ({ dir }: { dir: "left" | "right" }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d={dir === "left" ? "M9.5 3.5 5 8l4.5 4.5" : "M6.5 3.5 11 8l-4.5 4.5"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Náhľad cviku — obrázky (Free Exercise DB, externé URL) + kroky cvičenia.
 * Zdieľané medzi trénerovým builderom aj klientským portálom, aby oba
 * kontexty ukazovali rovnaký detail rovnako (viď lib/exercises.ts).
 *
 * `detail === undefined` → načítava sa, `null` → chyba/nenájdené, objekt → dáta.
 */
export function ExerciseDetailModal({
  detail,
  fallbackName,
  onClose,
}: {
  detail: ExerciseDetail | null | undefined;
  fallbackName: string;
  onClose: () => void;
}) {
  const [imgIdx, setImgIdx] = useState(0);

  useEffect(() => {
    setImgIdx(0);
  }, [detail]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const images = detail?.images ?? [];
  const title = detail ? displayExerciseName(detail.name, detail.nameSk) : fallbackName;

  return (
    <>
      <button type="button" className={styles.scrim} aria-label="Zavrieť náhľad cviku" onClick={onClose} />
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label={title}>
        <div className={styles.head}>
          <h3 className={styles.title}>{title}</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Zavrieť">
            <CloseIcon />
          </button>
        </div>

        {detail === undefined ? (
          <p className={styles.state}>Načítavam…</p>
        ) : detail === null ? (
          <p className={styles.state}>Pre tento cvik zatiaľ nemáme podrobný náhľad.</p>
        ) : (
          <>
            {detail.muscleGroup && <p className={styles.muscle}>{detail.muscleGroup}</p>}

            {images.length > 0 && (
              <div className={styles.gallery}>
                <div className={styles.imageFrame}>
                  {/* Externé obrázky z Free Exercise DB (raw.githubusercontent.com) — next/image
                      remotePatterns whitelist v next.config.ts. */}
                  <Image
                    src={images[imgIdx]}
                    alt={`${title} — krok ${imgIdx + 1}`}
                    fill
                    sizes="(max-width: 600px) 90vw, 420px"
                    className={styles.image}
                    unoptimized
                  />
                </div>
                {images.length > 1 && (
                  <div className={styles.galleryNav}>
                    <button
                      type="button"
                      className={styles.navBtn}
                      onClick={() => setImgIdx((i) => (i - 1 + images.length) % images.length)}
                      aria-label="Predchádzajúci obrázok"
                    >
                      <ChevronIcon dir="left" />
                    </button>
                    <span className={styles.navDots}>
                      {images.map((_, i) => (
                        <span key={i} className={`${styles.navDot} ${i === imgIdx ? styles.navDotOn : ""}`} />
                      ))}
                    </span>
                    <button
                      type="button"
                      className={styles.navBtn}
                      onClick={() => setImgIdx((i) => (i + 1) % images.length)}
                      aria-label="Ďalší obrázok"
                    >
                      <ChevronIcon dir="right" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {detail.instructions.length > 0 && (
              <ol className={styles.steps}>
                {detail.instructions.map((step, i) => (
                  <li key={i} className={styles.step}>
                    {step}
                  </li>
                ))}
              </ol>
            )}

            {images.length === 0 && detail.instructions.length === 0 && (
              <p className={styles.state}>Pre tento cvik zatiaľ nemáme podrobný náhľad.</p>
            )}
          </>
        )}
      </div>
    </>
  );
}
