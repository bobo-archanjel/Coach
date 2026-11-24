// FitPilot — odkazy na sociálne siete a web na verejnej stránke trénera. Čistý modul (testy: e2e/public-page.spec.ts).
// Povolené sú len https odkazy; pri sociálnych sieťach aj len ich vlastné domény (nedá sa vložiť cudzia adresa
// pod nálepkou „Instagram“). Žiadne javascript:, data:, http:, odkazy s prihlasovacími údajmi ani s portom.

export const SOCIAL_KINDS = ["instagram", "facebook", "tiktok", "youtube", "web"] as const;
export type SocialKind = (typeof SOCIAL_KINDS)[number];

/** Povolené hostiteľy (vrátane subdomén „www.“, „m.“) pre jednotlivé siete; `web` smie ľubovoľnú doménu. */
const SOCIAL_HOSTS: Record<Exclude<SocialKind, "web">, readonly string[]> = {
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.com", "fb.me"],
  tiktok: ["tiktok.com"],
  youtube: ["youtube.com", "youtu.be"],
};

export const SOCIAL_URL_MAX = 200;

export type SocialErrorCode = "socialInvalid" | "socialHost";
export type SocialValidation = { ok: true; value: string | null } | { ok: false; code: SocialErrorCode };
export type Socials = Partial<Record<SocialKind, string>>;

function hostMatches(host: string, allowed: readonly string[]): boolean {
  return allowed.some((a) => host === a || host.endsWith(`.${a}`));
}

/** Overí a zjednotí jeden odkaz. Prázdny vstup = bez odkazu (value null). Bez schémy sa doplní https://. */
export function validateSocialUrl(kind: SocialKind, input: unknown): SocialValidation {
  if (typeof input !== "string" || input.trim() === "") return { ok: true, value: null };
  let raw = input.trim();
  if (raw.length > SOCIAL_URL_MAX || /[\s<>"'`\\]/.test(raw) || /[\u0000-\u001F\u007F-\u009F]/.test(raw)) return { ok: false, code: "socialInvalid" };
  // schéma: povolené je len https (bez schémy sa doplní); všetko iné (http, javascript, data, ftp…) preč
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https:\/\//i.test(raw)) return { ok: false, code: "socialInvalid" };
  if (raw.startsWith("//")) return { ok: false, code: "socialInvalid" };
  if (!/^https:\/\//i.test(raw)) raw = `https://${raw}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, code: "socialInvalid" };
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return { ok: false, code: "socialInvalid" };
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  // hostiteľ s bodkou a platným TLD; IP adresy a „localhost“ nie
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}$/.test(host)) return { ok: false, code: "socialInvalid" };
  if (kind !== "web" && !hostMatches(host, SOCIAL_HOSTS[kind])) return { ok: false, code: "socialHost" };
  url.hash = "";
  return { ok: true, value: url.toString() };
}

/** Overí celý objekt odkazov; neznáme kľúče sa ignorujú. Chyba nesie sieť, ktorej sa týka. */
export function validateSocials(input: unknown): { ok: true; value: Socials } | { ok: false; code: SocialErrorCode; kind: SocialKind } {
  const src = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const out: Socials = {};
  for (const kind of SOCIAL_KINDS) {
    const r = validateSocialUrl(kind, src[kind]);
    if (!r.ok) return { ok: false, code: r.code, kind };
    if (r.value) out[kind] = r.value;
  }
  return { ok: true, value: out };
}

/** Bezpečné čítanie z DB (jsonb) pri vykreslení: neplatné odkazy sa potichu vynechajú. */
export function readSocials(input: unknown): Socials {
  const r = validateSocials(input);
  if (r.ok) return r.value;
  // jeden zlý odkaz nesmie schovať ostatné — prejdi po jednom
  const src = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const out: Socials = {};
  for (const kind of SOCIAL_KINDS) {
    const one = validateSocialUrl(kind, src[kind]);
    if (one.ok && one.value) out[kind] = one.value;
  }
  return out;
}

/** Atribút rel pre každý externý odkaz na stránke. */
export const EXTERNAL_REL = "nofollow noopener noreferrer";
