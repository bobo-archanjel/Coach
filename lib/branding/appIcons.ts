// FitPilot — generovanie ikon appky z loga trénera a farby značky (sharp). Bez I/O do siete/DB
// (testy: e2e/branding.spec.ts); ukladanie do úložiska rieši upload.ts. Vstupom je už znovu
// zakódované logo (WebP z processBrandImage), nikdy pôvodný nahraný súbor.

import sharp from "sharp";
import { extractPalette, meanOpaqueColor, pickIconBackground } from "./palette";

export interface AppIcons {
  /** „any“ ikony — logo ~80 % plochy (≈10 % okraj z každej strany) */
  png192: Buffer;
  png512: Buffer;
  /** maskable — logo v bezpečnej zóne (kruh 80 %), pozadie až po okraj; OS ho môže orezať do kruhu */
  maskable512: Buffer;
  /** apple-touch-icon 180×180 bez priehľadnosti (iOS ju inak vyplní čiernou) */
  apple180: Buffer;
  /** použité pozadie (#rrggbb) */
  background: string;
}

/** Podiel strany ikony, ktorý zaberie logo (zvyšok = ochranný okraj). */
export const ICON_LOGO_RATIO = { any: 0.8, maskable: 0.56, apple: 0.72 } as const;

const MAX_INPUT_PIXELS = 16_000_000;

/** Jedna ikona: logo vycentrované (zachovaný pomer strán) na plnofarebnom štvorci. */
async function renderTile(logo: Buffer, size: number, ratio: number, background: string): Promise<Buffer> {
  const box = Math.max(1, Math.round(size * ratio));
  const fitted = await sharp(logo, { limitInputPixels: MAX_INPUT_PIXELS })
    .resize({ width: box, height: box, fit: "inside" })
    .png()
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 3, background } })
    .composite([{ input: fitted, gravity: "centre" }])
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Zmenšené RGBA pixely loga na analýzu farieb (64×64 stačí, rýchle). */
async function sampleRgba(logo: Buffer): Promise<Buffer> {
  return sharp(logo, { limitInputPixels: MAX_INPUT_PIXELS })
    .resize({ width: 64, height: 64, fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer();
}

/** 3–5 dominantných farieb loga (bez bielej, čiernej a priehľadnej) ako návrhy akcentu. */
export async function paletteFromLogo(logo: Buffer): Promise<string[]> {
  try {
    return extractPalette(await sampleRgba(logo));
  } catch {
    return [];
  }
}

/** Vygeneruje všetky ikony appky. `accent` = farba značky (#rrggbb) alebo null (biele pozadie). */
export async function renderAppIcons(logo: Buffer, accent: string | null): Promise<AppIcons> {
  const background = pickIconBackground(accent, meanOpaqueColor(await sampleRgba(logo)));
  const [png192, png512, maskable512, apple180] = await Promise.all([
    renderTile(logo, 192, ICON_LOGO_RATIO.any, background),
    renderTile(logo, 512, ICON_LOGO_RATIO.any, background),
    renderTile(logo, 512, ICON_LOGO_RATIO.maskable, background),
    renderTile(logo, 180, ICON_LOGO_RATIO.apple, background),
  ]);
  return { png192, png512, maskable512, apple180, background };
}
