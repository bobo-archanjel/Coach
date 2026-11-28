// i18n-ignore-file: pomocník e2e — vymyslené dáta trénera pre verejnú stránku (nie používateľský text appky)
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

/**
 * Dočasné dáta verejnej stránky QA trénera (service role): riadok stránky, služby, referencie, galéria
 * (fotky v buckete `branding`), fotka a značka. Pred zápisom sa uloží snímka pôvodných riadkov a
 * `restore()` ich vráti späť (a zmaže nahrané objekty) — QA tréner po teste ostane ako bol.
 */

const TABLES = ["trainer_public_profiles", "trainer_services", "trainer_testimonials", "trainer_gallery", "trainer_branding"] as const;

export function adminClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function trainerIdByEmail(admin: SupabaseClient, email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  const u = data.users.find((x) => x.email === email);
  if (!u) throw new Error(`Používateľ ${email} neexistuje`);
  return u.id;
}

/** Stĺpec `template` existuje (migrácia 0090 prebehla)? */
export async function templateColumnExists(admin: SupabaseClient): Promise<boolean> {
  const { error } = await admin.from("trainer_public_profiles").select("template").limit(1);
  return !error;
}

/** Umelá „fotka“ (teplý prechod + silueta) ako webp — zdroj pre štýlové snímky. */
async function fakePhoto(kind: "portrait" | "scene", hue: number, size = 800): Promise<Buffer> {
  const bg = `hsl(${hue},45%,${kind === "portrait" ? 62 : 55}%)`;
  const bg2 = `hsl(${(hue + 30) % 360},50%,${kind === "portrait" ? 38 : 30}%)`;
  const person =
    kind === "portrait"
      ? `<circle cx="400" cy="330" r="120" fill="hsl(${hue},30%,82%)"/><path d="M130 800 C130 560 250 500 400 500 C550 500 670 560 670 800 Z" fill="hsl(${hue},25%,22%)"/>`
      : `<circle cx="${200 + (hue % 300)}" cy="300" r="90" fill="rgba(255,255,255,0.25)"/><rect x="120" y="520" width="560" height="26" rx="13" fill="rgba(255,255,255,0.35)"/><rect x="200" y="470" width="40" height="130" rx="10" fill="rgba(255,255,255,0.45)"/><rect x="560" y="470" width="40" height="130" rx="10" fill="rgba(255,255,255,0.45)"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 800 800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${bg2}"/></linearGradient></defs><rect width="800" height="800" fill="url(#g)"/>${person}</svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer();
}

export interface SeedOptions {
  handle?: string;
  withPhoto?: boolean;
  gallery?: number;
  services?: number;
  testimonials?: number;
  accent?: string | null;
  brandName?: string;
  template?: string;
}

export interface Seeded {
  trainerId: string;
  handle: string;
  restore: () => Promise<void>;
}

export async function seedPublicPage(admin: SupabaseClient, trainerId: string, opt: SeedOptions = {}): Promise<Seeded> {
  const snapshot: Record<string, Record<string, unknown>[]> = {};
  for (const t of TABLES) {
    const { data, error } = await admin.from(t).select("*").eq("trainer_id", trainerId);
    if (error) throw new Error(`snapshot ${t}: ${error.message}`);
    snapshot[t] = data ?? [];
  }
  const uploaded: string[] = [];
  const upload = async (path: string, buf: Buffer) => {
    const { error } = await admin.storage.from("branding").upload(path, buf, { contentType: "image/webp", upsert: false });
    if (error) throw new Error(`upload ${path}: ${error.message}`);
    uploaded.push(path);
  };

  const restore = async () => {
    for (const t of [...TABLES].reverse()) await admin.from(t).delete().eq("trainer_id", trainerId);
    // pôvodné riadky späť (poradie: stránka a značka sú nezávislé, zvyšok na nich nezávisí)
    for (const t of TABLES) if (snapshot[t].length) await admin.from(t).insert(snapshot[t]);
    if (uploaded.length) await admin.storage.from("branding").remove(uploaded);
  };

  try {
    for (const t of TABLES) await admin.from(t).delete().eq("trainer_id", trainerId);

    const handle = opt.handle ?? "qa-sablony";
    const profile: Record<string, unknown> = {
      trainer_id: trainerId,
      handle,
      published: false,
      headline: "Osobný tréner pre ženy po tehotenstve",
      bio: "Trénujem 9 rokov a pomáham ženám vrátiť sa do formy bez extrémov.\nSilový tréning, mobilita a výživa na mieru — online aj naživo v Bratislave.",
      location: "Bratislava, Ružinov",
      online: true,
      specializations: ["silový tréning", "chudnutie", "mobilita"],
      socials: { instagram: "https://instagram.com/qa-trener", web: "https://example.com" },
    };
    if (opt.template) profile.template = opt.template;
    let r = await admin.from("trainer_public_profiles").insert(profile);
    if (r.error) throw new Error(`profile: ${r.error.message}`);

    const nSvc = opt.services ?? 3;
    const svc = [
      { name: "Online vedenie", description: "Plán tréningov a jedálnička, týždenná kontrola a správy počas týždňa.", price_text: "od 49 € / mesiac" },
      { name: "Osobný tréning", description: "Hodina v štúdiu, technika cvikov a program na mieru.", price_text: "35 € / hodina" },
      { name: "Úvodná konzultácia", description: "", price_text: "zadarmo" },
    ].slice(0, nSvc);
    if (svc.length) {
      r = await admin.from("trainer_services").insert(svc.map((s, i) => ({ trainer_id: trainerId, position: i, ...s })));
      if (r.error) throw new Error(`services: ${r.error.message}`);
    }

    const nTst = opt.testimonials ?? 3;
    const tst = [
      { author: "Jana K.", body: "Po troch mesiacoch mám viac sily než pred tehotenstvom. Plán sa dal zvládnuť aj s malým doma." },
      { author: "Petra M.", body: "Konečne cvičím pravidelne. Nikdy som nemala pocit, že ma niekto tlačí." },
      { author: "Lucia H.", body: "Jedálniček bol realistický a nemusela som sa vzdať všetkého, čo mám rada." },
    ].slice(0, nTst);
    if (tst.length) {
      r = await admin.from("trainer_testimonials").insert(tst.map((s, i) => ({ trainer_id: trainerId, position: i, ...s })));
      if (r.error) throw new Error(`testimonials: ${r.error.message}`);
    }

    let photoPath: string | null = null;
    if (opt.withPhoto !== false) {
      photoPath = `${trainerId}/photo-${randomUUID()}.webp`;
      await upload(photoPath, await fakePhoto("portrait", 18));
    }
    const nGal = opt.gallery ?? 4;
    const gallery: { trainer_id: string; position: number; path: string }[] = [];
    for (let i = 0; i < nGal; i++) {
      const path = `${trainerId}/gallery-${randomUUID()}.webp`;
      await upload(path, await fakePhoto("scene", 10 + i * 55));
      gallery.push({ trainer_id: trainerId, position: i, path });
    }
    if (gallery.length) {
      r = await admin.from("trainer_gallery").insert(gallery);
      if (r.error) throw new Error(`gallery: ${r.error.message}`);
    }

    r = await admin.from("trainer_branding").insert({ trainer_id: trainerId, brand_name: opt.brandName ?? "Maja Fitová", accent_color: opt.accent ?? null, photo_path: photoPath });
    if (r.error) throw new Error(`branding: ${r.error.message}`);
    return { trainerId, handle, restore };
  } catch (e) {
    await restore();
    throw e;
  }
}
