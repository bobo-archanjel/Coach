"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import d from "./builderDialog.module.css";

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/**
 * Okno nad builderom tréningu (tréner aj klient), napr. „+ deň“. Esc, klik mimo aj ✕
 * zavrú; stránka pod oknom sa neposúva; po zatvorení sa fokus vráti na prvok, ktorý
 * okno otvoril (napr. „+ deň“). Obsah (formulár) dodá volajúci — triedy pre pole a
 * tlačidlá sú v builderDialog.module.css.
 */
export function BuilderDialog({
  title,
  closeLabel,
  onClose,
  children,
}: {
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  // Prvok, ktorý okno otvoril — zachytený už pri prvom vykreslení: autoFocus poľa v okne
  // presunie fokus skôr, než bežia efekty. Okno sa vykresľuje len v prehliadači (po kliku).
  const [opener] = useState(() =>
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const mounted = useRef(false);
  const layerRef = useRef<HTMLDivElement>(null);

  // Vrstva = viditeľná časť obrazovky (mobilná klávesnica ju zmenšuje) → okno v jej strede.
  useEffect(() => {
    const vv = window.visualViewport;
    const layer = layerRef.current;
    if (!vv || !layer) return;
    const sync = () => {
      layer.style.setProperty("--vv-top", `${vv.offsetTop}px`);
      layer.style.setProperty("--vv-h", `${vv.height}px`);
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);

  useEffect(() => {
    mounted.current = true;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      // Fokus späť na otvárač až po skutočnom zatvorení — v dev Strict Mode React efekt
      // hneď spustí znova (mounted je opäť true) a fokus má ostať v okne.
      mounted.current = false;
      queueMicrotask(() => {
        if (!mounted.current && opener?.isConnected) opener.focus({ preventScroll: true });
      });
    };
  }, [opener]);

  const dialog = (
    <div ref={layerRef} className={d.layer}>
      <button type="button" className={d.scrim} aria-label={closeLabel} tabIndex={-1} onClick={onClose} />
      <div className={d.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={d.head}>
          <h2 id={titleId} className={d.title}>
            {title}
          </h2>
          <button type="button" className={d.close} onClick={onClose} aria-label={closeLabel}>
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );

  // nad celou stránkou; do koreňa dizajnu v6 kvôli tokenom témy
  return createPortal(dialog, document.querySelector("[data-v6-root]") ?? document.body);
}
