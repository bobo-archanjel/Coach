import brand from "./branding.module.css";

/**
 * Logo trénera (branding, Business) s variantom pre tmavú tému. Keď tréner nahral aj logo na tmavé
 * pozadie, vykreslia sa oba obrázky a CSS zobrazí ten, ktorý sedí k téme portálu (`data-theme`
 * svetlá / tmavá / auto podľa telefónu) — bez JS, takže bez záblesku opačného loga pri načítaní.
 * Bez tmavého loga sa vykreslí jeden obrázok. Server aj klient (žiadny stav).
 */
export function BrandLogo({ src, darkSrc }: { src: string | null; darkSrc: string | null }) {
  const light = src ?? darkSrc;
  if (!light) return null;
  if (!darkSrc || !src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={light} alt="" className={brand.brandLogo} />;
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className={`${brand.brandLogo} ${brand.logoLight}`} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={darkSrc} alt="" loading="lazy" className={`${brand.brandLogo} ${brand.logoDark}`} />
    </>
  );
}
