// Spoločné orezanie číselných vstupov zo serverových akcií (portál aj dashboard) —
// hodnoty z formulára/klienta sa nikdy nevkladajú do DB bez hraníc.

/** Celé číslo orezané do <min, max>; nečíselné → fallback. */
export function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Voliteľné číslo orezané do <min, max>; prázdne/nečíselné → null. */
export function optionalNum(v: unknown, min: number, max: number): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}
