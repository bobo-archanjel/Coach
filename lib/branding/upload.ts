import "server-only";
import { randomUUID } from "crypto";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IMAGE_MAX_SIDE, brandObjectPath, isOwnBrandPath, sniffImageType, type BrandImageKind } from "./image";
import { MAX_UPLOAD_BYTES } from "./validation";
import { BRANDING_BUCKET } from "./server";

export type ProcessImageError = "tooLarge" | "badType" | "decodeFailed";

/** Max. počet pixelov na vstupe (ochrana pred „pixel bombou“ — malý súbor, obrovský obrázok). */
const MAX_INPUT_PIXELS = 16_000_000;

/**
 * Overí a znovu zakóduje nahraný obrázok: veľkosť → magic bytes → dekódovanie sharpom
 * s limitom pixelov → otočenie podľa EXIF → zmenšenie → WebP BEZ metadát (sharp ich v
 * predvolenom stave nekopíruje). Re-enkódovanie neutralizuje polyglotov (platný obrázok
 * s pripojeným skriptom/archívom) — z pôvodných bajtov sa nezachová nič.
 */
export async function processBrandImage(
  bytes: Uint8Array,
  kind: BrandImageKind,
): Promise<{ ok: true; webp: Buffer } | { ok: false; error: ProcessImageError }> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_UPLOAD_BYTES) return { ok: false, error: "tooLarge" };
  if (!sniffImageType(bytes)) return { ok: false, error: "badType" };
  try {
    const side = IMAGE_MAX_SIDE[kind];
    const webp = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error", animated: false })
      .rotate()
      .resize({ width: side, height: side, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 86 })
      .toBuffer();
    return { ok: true, webp };
  } catch {
    return { ok: false, error: "decodeFailed" };
  }
}

/**
 * Nahrá už spracovaný obrázok do bucketu cez service role (jediná cesta zápisu, viď 0075)
 * pod serverom vygenerovaným názvom a zmaže predchádzajúci súbor. Vráti novú cestu.
 */
export async function storeBrandImage(
  admin: SupabaseClient,
  trainerId: string,
  kind: BrandImageKind,
  webp: Buffer,
  previousPath: string | null,
): Promise<{ path: string } | { error: string }> {
  const path = brandObjectPath(trainerId, kind, randomUUID());
  const { error } = await admin.storage.from(BRANDING_BUCKET).upload(path, webp, {
    contentType: "image/webp",
    cacheControl: "31536000", // názov obsahuje UUID → obsah sa nikdy nemení
    upsert: false,
  });
  if (error) return { error: error.message };
  if (previousPath) await removeBrandImage(admin, trainerId, kind, previousPath);
  return { path };
}

/** Zmaže súbor značky — len ak cesta patrí tomuto trénerovi a má očakávaný tvar. Chyba sa neprepúšťa (best effort). */
export async function removeBrandImage(admin: SupabaseClient, trainerId: string, kind: BrandImageKind, path: string | null): Promise<void> {
  if (!isOwnBrandPath(trainerId, path, kind) || !path) return;
  const { error } = await admin.storage.from(BRANDING_BUCKET).remove([path]);
  if (error) console.error("branding.removeBrandImage:", error.message);
}
