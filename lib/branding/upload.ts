import "server-only";
import { randomUUID } from "crypto";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ICON_VARIANTS, IMAGE_MAX_SIDE, brandIconPath, brandObjectPath, isOwnBrandPath, isOwnIconPath, sniffImageType, type BrandImageKind, type IconVariant } from "./image";
import { renderAppIcons } from "./appIcons";
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

/** Cesty vygenerovaných ikon appky v buckete (všetky štyri naraz). */
export type IconPaths = Record<IconVariant, string>;

/**
 * Z loga (WebP) a farby značky vygeneruje ikony appky a nahrá ich (PNG, UUID názvy) cez service role.
 * Pri čiastočnom zlyhaní nahrané súbory vráti späť — buď všetky štyri, alebo žiadna.
 */
export async function storeAppIcons(
  admin: SupabaseClient,
  trainerId: string,
  logoWebp: Buffer,
  accent: string | null,
): Promise<{ paths: IconPaths } | { error: string }> {
  let rendered;
  try {
    rendered = await renderAppIcons(logoWebp, accent);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "icon render failed" };
  }
  const bytes: Record<IconVariant, Buffer> = {
    "192": rendered.png192,
    "512": rendered.png512,
    maskable: rendered.maskable512,
    apple: rendered.apple180,
  };
  const paths = {} as IconPaths;
  for (const variant of ICON_VARIANTS) {
    const path = brandIconPath(trainerId, variant, randomUUID());
    const { error } = await admin.storage.from(BRANDING_BUCKET).upload(path, bytes[variant], {
      contentType: "image/png",
      cacheControl: "31536000", // názov obsahuje UUID → obsah sa nikdy nemení
      upsert: false,
    });
    if (error) {
      await removeAppIcons(admin, trainerId, paths);
      return { error: error.message };
    }
    paths[variant] = path;
  }
  return { paths };
}

/** Zmaže ikony appky — len cesty, ktoré patria tomuto trénerovi a majú očakávaný tvar (best effort). */
export async function removeAppIcons(
  admin: SupabaseClient,
  trainerId: string,
  paths: Partial<Record<IconVariant, string | null | undefined>>,
): Promise<void> {
  const own = ICON_VARIANTS.map((v) => paths[v]).filter(
    (p, i): p is string => typeof p === "string" && isOwnIconPath(trainerId, p, ICON_VARIANTS[i]),
  );
  if (own.length === 0) return;
  const { error } = await admin.storage.from(BRANDING_BUCKET).remove(own);
  if (error) console.error("branding.removeAppIcons:", error.message);
}

/** Stiahne uložené logo z bucketu (na prepočet ikon po zmene farby bez nového nahrávania). */
export async function downloadBrandLogo(admin: SupabaseClient, trainerId: string, logoPath: string | null): Promise<Buffer | null> {
  if (!logoPath || !isOwnBrandPath(trainerId, logoPath, "logo")) return null;
  const { data, error } = await admin.storage.from(BRANDING_BUCKET).download(logoPath);
  if (error || !data) return null;
  const buf = Buffer.from(await data.arrayBuffer());
  return buf.byteLength > 0 && buf.byteLength <= MAX_UPLOAD_BYTES ? buf : null;
}
