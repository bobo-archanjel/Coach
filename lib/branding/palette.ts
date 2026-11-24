// FitPilot — farby z loga trénera (návrhy akcentu) a výber pozadia ikony. Čistý modul bez I/O
// (testy: e2e/branding.spec.ts). Vstupom sú surové RGBA pixely (zmenšený obrázok zo sharpu).

import { contrastRatio, deriveBrandTheme, rgbToHex } from "./colors";

/** Predvolený počet návrhov farieb. */
export const PALETTE_SIZE = 5;
/** Najmenšia vzdialenosť (RGB, euklidovsky) dvoch návrhov — nech nie sú 3 odtiene tej istej farby. */
const MIN_DISTANCE = 64;

/** Takmer biela alebo takmer čierna (a priehľadná) farba nie je zmysluplný akcent. */
function ignored(r: number, g: number, b: number, a: number): boolean {
  if (a < 128) return true;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2 / 255;
  return l >= 0.92 || l <= 0.1;
}

/**
 * Z RGBA pixelov vyberie 3–5 dominantných farieb (menej, ak logo toľko farieb nemá).
 * Pixely sa zoskupia do 4096 košov (4 bity na kanál), koše sa zoradia podľa počtu pixelov
 * so zvýhodnením sýtych farieb (šedá plocha pozadia nemá prebiť farebné logo) a vyberajú
 * sa po jednom tak, aby sa od už vybraných dosť líšili. Farba koša = priemer jeho pixelov.
 * Deterministické (rovnaký vstup → rovnaký výstup).
 */
export function extractPalette(rgba: ArrayLike<number>, count: number = PALETTE_SIZE): string[] {
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    if (ignored(r, g, b, rgba[i + 3])) continue;
    total++;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bin = bins.get(key);
    if (bin) {
      bin.n++;
      bin.r += r;
      bin.g += g;
      bin.b += b;
    } else {
      bins.set(key, { n: 1, r, g, b });
    }
  }
  if (total === 0) return [];

  const ranked = [...bins.entries()]
    .map(([key, v]) => {
      const mean = { r: v.r / v.n, g: v.g / v.n, b: v.b / v.n };
      const max = Math.max(mean.r, mean.g, mean.b);
      const sat = max === 0 ? 0 : (max - Math.min(mean.r, mean.g, mean.b)) / max;
      return { key, n: v.n, mean, score: v.n * (0.35 + sat) };
    })
    // zanedbateľné koše (šum, antialiasing hrán) sa neberú
    .filter((c) => c.n / total >= 0.004)
    .sort((a, b) => b.score - a.score || a.key - b.key);

  const picked: { r: number; g: number; b: number }[] = [];
  for (const c of ranked) {
    if (picked.length >= count) break;
    const far = picked.every((p) => Math.hypot(p.r - c.mean.r, p.g - c.mean.g, p.b - c.mean.b) >= MIN_DISTANCE);
    if (far) picked.push(c.mean);
  }
  return picked.map(rgbToHex);
}

/** Priemerná farba nepriehľadných pixelov (alebo null, ak logo nemá nepriehľadné pixely). */
export function meanOpaqueColor(rgba: ArrayLike<number>): string | null {
  let n = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    n++;
    r += rgba[i];
    g += rgba[i + 1];
    b += rgba[i + 2];
  }
  return n === 0 ? null : rgbToHex({ r: r / n, g: g / n, b: b / n });
}

/**
 * Pozadie ikony appky: farba značky (kontrastná výplň z témy), ale ak by sa logo na nej
 * strácalo (kontrast < 2:1, napr. modré logo na modrom), tak biela. Bez farby značky je biela.
 */
export function pickIconBackground(accent: string | null, logoColor: string | null): string {
  const fill = deriveBrandTheme(accent)?.light.accent ?? null;
  if (!fill) return "#ffffff";
  if (!logoColor) return fill;
  if (contrastRatio(logoColor, fill) >= 2) return fill;
  return contrastRatio(logoColor, "#ffffff") > contrastRatio(logoColor, fill) ? "#ffffff" : fill;
}

