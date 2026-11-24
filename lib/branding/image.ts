// FitPilot — rozpoznanie typu nahrávaného obrázka podľa MAGIC BYTES (nie podľa hlavičky
// Content-Type ani prípony — tie si útočník vymyslí). Čistý modul (testy: e2e/branding.spec.ts).
// Povolené sú LEN PNG, JPEG a WebP; SVG/GIF/HTML a všetko ostatné sa odmietne ešte pred
// dekódovaním. Súbor sa potom aj tak znovu zakóduje (sharp, lib/branding/upload.ts).

export type SniffedImage = "png" | "jpeg" | "webp";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  return sig.every((b, i) => bytes[offset + i] === b);
}

export function sniffImageType(bytes: Uint8Array): SniffedImage | null {
  if (startsWith(bytes, PNG)) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  // WebP: "RIFF" ???? "WEBP"
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  return null;
}

/** Cieľový rozmer po zmenšení (px, dlhšia strana) — logo menšie, fotka väčšia. */
export const IMAGE_MAX_SIDE = { logo: 512, photo: 800 } as const;
export type BrandImageKind = keyof typeof IMAGE_MAX_SIDE;

/** Cesta objektu v buckete: `<trainerId>/<kind>-<uuid>.webp` — názov vždy generuje server. */
export function brandObjectPath(trainerId: string, kind: BrandImageKind, uuid: string): string {
  return `${trainerId}/${kind}-${uuid}.webp`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Patrí cesta (z DB) danému trénerovi a má očakávaný tvar? Stráž pred mazaním/čítaním cudzích súborov. */
export function isOwnBrandPath(trainerId: string, path: string | null | undefined, kind: BrandImageKind): boolean {
  if (!path) return false;
  const m = /^([0-9a-f-]{36})\/(logo|photo)-([0-9a-f-]{36})\.webp$/.exec(path);
  return Boolean(m && m[1] === trainerId && m[2] === kind && UUID_RE.test(m[1]) && UUID_RE.test(m[3]));
}
