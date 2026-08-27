/** FitPilot logo mark — vlastná SVG rekonštrukcia z brand kitu (DESIGN.md). Nahradiť skutočným exportom pri produkčnom nasadení. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 60 70" aria-hidden="true">
      <defs>
        <linearGradient id="fpBar" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f2703a" />
          <stop offset="1" stopColor="#e0402a" />
        </linearGradient>
        <linearGradient id="fpDart" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e6b23a" />
          <stop offset="1" stopColor="#e0402a" />
        </linearGradient>
      </defs>
      <polygon points="10,2 58,2 47,18 0,18" fill="url(#fpBar)" />
      <polygon points="10,27 44,27 34,43 0,43" fill="url(#fpBar)" />
      <polygon points="0,44 24,58 0,70" fill="url(#fpDart)" />
    </svg>
  );
}
