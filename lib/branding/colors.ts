// FitPilot — farby značky trénera (branding, tarifa Business). Čistý modul bez I/O
// (testy: e2e/branding.spec.ts). Tréner si vyberie JEDNU farbu; z nej sa tu odvodia
// všetky akcentové tokeny portálu tak, aby text bol vždy čitateľný (WCAG AA):
//  - výplň (tlačidlá, aktívna záložka) má kontrast ≥ 3:1 voči pozadiu témy,
//  - text v akcentovej farbe (odkazy, štítky) ≥ 4.5:1 voči povrchu témy,
//  - text NA akcentovej výplni (--on-accent) je biely/tmavý podľa vyššieho kontrastu (≥ 4.5:1).
// Pri nevyhovujúcej farbe sa upraví JAS (odtieň ostáva), nikdy sa farba neodmietne.

export const HEX_RE = /^#[0-9a-f]{6}$/;

/** Predvolená farba FitPilot (terakota) — východisko výberu farby v nastaveniach. */
export const DEFAULT_ACCENT = "#d9694a";

/** Hotové farby na výber (rýchle predvoľby vedľa výberu farby). */
export const ACCENT_PRESETS = ["#d9694a", "#2f6fed", "#1f9d6b", "#8b5cf6", "#e0457b", "#e08a1e", "#0f172a"] as const;

/** Povrchy tém, voči ktorým sa kontrast počíta (najhorší prípad — tmavší povrch svetlej témy,
 *  svetlejší povrch tmavej témy). Zrkadlí tokeny v app/v6design/styles/tokens.module.css. */
const LIGHT_BG = "#f2ece6";
const DARK_BG = "#0f0c0b";
const DARK_SURFACE = "#2a2420";

const ON_LIGHT = "#ffffff";
const ON_DARK = "#080504"; // skoro čierna — s bielou garantuje, že aspoň jedna z nich má voči ľubovoľnej farbe kontrast >= 4.5:1

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** `#RRGGBB` (aj veľké písmená, bez `#`) → malé `#rrggbb`; neplatné → null. */
export function normalizeHex(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim().toLowerCase();
  const withHash = s.startsWith("#") ? s : `#${s}`;
  return HEX_RE.test(withHash) ? withHash : null;
}

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Relatívna luminancia podľa WCAG 2.x. */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Kontrastný pomer dvoch farieb (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Text na farebnej výplni: biely alebo tmavý — podľa toho, ktorý má vyšší kontrast (vždy ≥ 4.5:1). */
export function pickOnColor(fill: string): string {
  return contrastRatio(fill, ON_LIGHT) >= contrastRatio(fill, ON_DARK) ? ON_LIGHT : ON_DARK;
}

function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

/**
 * Upraví jas farby (odtieň a sýtosť ostávajú) smerom `darken`/`lighten`, kým kontrast voči
 * `against` nedosiahne `min`. Farba, ktorá už vyhovuje, sa nezmení. Vždy skončí (jas sa
 * zastaví na 0/1, čierna/biela majú voči povrchom témy kontrast ≥ 3:1 aj ≥ 4.5:1).
 */
export function ensureContrast(hex: string, against: string, min: number, direction: "darken" | "lighten"): string {
  if (contrastRatio(hex, against) >= min) return hex;
  const { h, s, l } = rgbToHsl(hexToRgb(hex));
  const step = direction === "darken" ? -0.01 : 0.01;
  let cur = l;
  for (let i = 0; i < 100; i++) {
    cur = Math.max(0, Math.min(1, cur + step));
    const candidate = rgbToHex(hslToRgb(h, s, cur));
    if (contrastRatio(candidate, against) >= min) return candidate;
    if (cur === 0 || cur === 1) break;
  }
  return direction === "darken" ? "#000000" : "#ffffff";
}

export function mix(hex: string, towards: string, amount: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(towards);
  return rgbToHex({ r: a.r + (b.r - a.r) * amount, g: a.g + (b.g - a.g) * amount, b: a.b + (b.b - a.b) * amount });
}

function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Hodnoty jednej témy (svetlá / tmavá) odvodené z farby značky. */
export interface BrandTone {
  /** výplň (tlačidlá, aktívne prvky) — kontrast ≥ 3:1 voči pozadiu témy */
  accent: string;
  /** text v akcentovej farbe — kontrast ≥ 4.5:1 voči povrchu témy */
  text: string;
  /** text NA výplni — kontrast ≥ 4.5:1 voči `accent` */
  on: string;
  soft: string;
  glow: string;
  dim: string;
  deep: string;
}

export interface BrandTheme {
  /** farba, ktorú tréner vybral (normalizovaná) */
  base: string;
  light: BrandTone;
  dark: BrandTone;
}

function tone(base: string, fillBg: string, textBg: string, direction: "darken" | "lighten", softAlpha: number): BrandTone {
  let accent = ensureContrast(base, fillBg, 3, direction);
  let on = pickOnColor(accent);
  // poistka: ak by ani jedna z dvojice (biela / tmavá) nedala 4.5:1, farba výplne sa posunie
  if (contrastRatio(accent, on) < 4.5) {
    accent = ensureContrast(accent, on, 4.5, on === ON_LIGHT ? "darken" : "lighten");
    on = pickOnColor(accent);
  }
  const text = ensureContrast(base, textBg, 4.5, direction);
  return {
    accent,
    text,
    on,
    soft: rgba(accent, softAlpha),
    glow: `0 12px 24px -12px ${rgba(accent, 0.6)}`,
    dim: mix(accent, "#000000", 0.18),
    deep: mix(accent, "#000000", 0.08),
  };
}

/** Odvodí tokeny svetlej aj tmavej témy z jednej farby. Neplatná farba → null (ostane FitPilot). */
export function deriveBrandTheme(accent: unknown): BrandTheme | null {
  const base = normalizeHex(accent);
  if (!base) return null;
  return {
    base,
    light: tone(base, LIGHT_BG, LIGHT_BG, "darken", 0.13),
    dark: tone(base, DARK_BG, DARK_SURFACE, "lighten", 0.16),
  };
}

/**
 * Vlastné CSS premenné na koreň portálu (inline `style`). Hodnoty sú VÝHRADNE čísla/hex
 * odvodené vyššie z overeného `#rrggbb` — žiadny voľný text od používateľa. Pravidlo
 * `.branded` (app/components/branding.module.css) z nich poskladá akcentové tokeny podľa témy.
 */
export function brandCssVars(theme: BrandTheme): Record<string, string> {
  const l = theme.light;
  const d = theme.dark;
  return {
    "--brand-l-accent": l.accent,
    "--brand-l-text": l.text,
    "--brand-l-on": l.on,
    "--brand-l-soft": l.soft,
    "--brand-l-glow": l.glow,
    "--brand-l-dim": l.dim,
    "--brand-l-deep": l.deep,
    "--brand-d-accent": d.accent,
    "--brand-d-text": d.text,
    "--brand-d-on": d.on,
    "--brand-d-soft": d.soft,
    "--brand-d-glow": d.glow,
    "--brand-d-dim": d.dim,
    "--brand-d-deep": d.deep,
  };
}
