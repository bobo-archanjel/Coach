import Image from "next/image";
import logoMark from "@/public/brand/logo-mark.png";

/**
 * FitPilot logo mark — skutočný export z brand kitu (`docs/Design/logo.png`,
 * zdieľaný súbor s `favicon.ico`), preškálovaný na 128×128 v `public/brand/logo-mark.png`.
 * Predtým vlastná SVG rekonštrukcia (viď git história) — nahradená 2026-08-30,
 * keď boli dodané reálne asset súbory. `object-fit: contain` drží pomer strán
 * nezávisle od width/height triedy jednotlivého miesta použitia (nav, header, auth) —
 * tie triedy prepíšu width/height cez CSS, `next/image` len drží LCP/optimalizáciu.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src={logoMark}
      alt=""
      aria-hidden="true"
      className={className}
      style={{ objectFit: "contain" }}
    />
  );
}
