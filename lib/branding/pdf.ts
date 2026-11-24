import "server-only";
import sharp from "sharp";
import type { PdfBrand } from "@/lib/pdf/document";
import { mix } from "./colors";
import { loadBrandingForTrainer } from "./server";
import { MAX_UPLOAD_BYTES } from "./validation";

/** Povolené znaky názvu v PDF (písmo Inter vie latinku) — emoji a exotické písma sa vyhodia. */
function pdfSafeName(name: string): string {
  return name.replace(/[^\p{Script=Latin}\p{N}\p{P}\p{Zs}+&$%=@#]/gu, "").replace(/\s{2,}/g, " ").trim();
}

/** Stiahne logo z verejného bucketu (URL poskladaná zo servera + overenej cesty) a vráti PNG pre pdf-lib. */
async function logoAsPng(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), cache: "force-cache" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_UPLOAD_BYTES) return null;
    return await sharp(buf, { limitInputPixels: 16_000_000 })
      .resize({ width: 256, height: 256, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

/**
 * Značka trénera pre PDF exporty (plán, jedálniček). `null` = nezmenený vzhľad FitPilot
 * (tréner nemá Business, značku nenastavil, alebo chyba). Chyba pri logu nikdy nezhodí export —
 * dokument sa vygeneruje s názvom a farbou, bez loga.
 */
export async function loadPdfBrand(trainerId: string | null | undefined): Promise<PdfBrand | null> {
  const branding = await loadBrandingForTrainer(trainerId);
  if (!branding) return null;
  const name = pdfSafeName(branding.brandName);
  const logoPng = branding.logoUrl ? await logoAsPng(branding.logoUrl) : null;
  if (!name && !logoPng && !branding.theme) return null;
  // PDF je vždy svetlý — berie sa svetlý variant tém (kontrast voči svetlému povrchu)
  const accent = branding.theme?.light.accent ?? "#d9694a";
  const accentText = branding.theme?.light.text ?? "#b4492d";
  return {
    name: name || "FitPilot",
    accent,
    accentText,
    // jemný odtieň farby značky nad bielou kartou (štítok druhu dokumentu, čipy)
    accentSoft: mix(accent, "#fbf8f6", 0.86),
    logoPng,
  };
}
