import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { brandingPublicUrl } from "@/lib/branding/server";
import { deriveBrandTheme } from "@/lib/branding/colors";
import { cleanLine, cleanMultiline } from "@/lib/branding/validation";
import { isOwnBrandPath } from "@/lib/branding/image";
import { isHandleShape } from "./handle";
import { readSocials } from "./socials";
import { coerceTemplate } from "./templates";
import type { PublicPageData } from "./types";

// FitPilot — načítanie verejnej stránky trénera. Verejné čítanie ide VÝHRADNE cez SECURITY DEFINER RPC
// get_public_trainer_page (0083), ktoré vracia len publikované stránky trénerov s Business; volá sa so
// service role po overení tvaru handle (náhodné cesty sa do DB vôbec nedostanú).

const UUID_PATH = /^[0-9a-f-]{36}\/gallery-[0-9a-f-]{36}\.webp$/;

interface RpcPage {
  handle?: unknown;
  headline?: unknown;
  bio?: unknown;
  location?: unknown;
  online?: unknown;
  specializations?: unknown;
  socials?: unknown;
  updated_at?: unknown;
  display_name?: unknown;
  accent_color?: unknown;
  logo_path?: unknown;
  logo_dark_path?: unknown;
  photo_path?: unknown;
  services?: unknown;
  gallery?: unknown;
  testimonials?: unknown;
  template?: unknown;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** Cesta z DB patrí do priečinka trénera (priečinok je UUID) a má tvar `<uuid>/<kind>-<uuid>.webp`. */
function pathOk(p: unknown, kind: "logo" | "logodark" | "photo"): string | null {
  const s = str(p);
  if (!s) return null;
  const m = /^([0-9a-f-]{36})\//.exec(s);
  return m && isOwnBrandPath(m[1], s, kind) ? s : null;
}

/** Zloží dáta stránky z jsonb (RPC) alebo z vlastných tabuliek; všetky texty sa pre istotu čistia ešte raz. */
export function toPublicPage(row: RpcPage): PublicPageData | null {
  const handle = str(row.handle);
  if (!isHandleShape(handle)) return null;
  const accent = typeof row.accent_color === "string" ? row.accent_color : null;
  return {
    handle,
    displayName: cleanLine(row.display_name),
    headline: cleanLine(row.headline),
    bio: cleanMultiline(row.bio),
    location: cleanLine(row.location),
    online: row.online === true,
    specializations: arr(row.specializations).map((s) => cleanLine(s)).filter(Boolean).slice(0, 8),
    socials: readSocials(row.socials),
    services: arr(row.services)
      .map((s) => {
        const o = obj(s);
        return { name: cleanLine(o.name), description: cleanMultiline(o.description), priceText: cleanLine(o.price_text) };
      })
      .filter((s) => s.name)
      .slice(0, 6),
    testimonials: arr(row.testimonials)
      .map((t) => {
        const o = obj(t);
        return { author: cleanLine(o.author), body: cleanMultiline(o.body) };
      })
      .filter((t) => t.author && t.body)
      .slice(0, 6),
    galleryUrls: arr(row.gallery)
      .map((p) => (typeof p === "string" && UUID_PATH.test(p) ? brandingPublicUrl(p) : null))
      .filter((u): u is string => !!u)
      .slice(0, 6),
    logoUrl: brandingPublicUrl(pathOk(row.logo_path, "logo")),
    logoDarkUrl: brandingPublicUrl(pathOk(row.logo_dark_path, "logodark")),
    photoUrl: brandingPublicUrl(pathOk(row.photo_path, "photo")),
    theme: deriveBrandTheme(accent),
    template: coerceTemplate(row.template),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

/**
 * Verejná stránka podľa handle. `null` = neexistuje / nepublikovaná / tréner bez Business / chyba
 * (fail-closed: chyba DB = 404, nikdy nepublikovaný obsah).
 */
export const PUBLIC_PAGE_TAG = "public-page";
const PUBLIC_PAGE_TTL_S = 300;

/** Surová odpoveď RPC cachovaná na server (Data Cache, tag + 5 min). Chyba sa VYHODÍ — neuloží sa do cache. */
const fetchPublicPageRaw = unstable_cache(
  async (handle: string): Promise<RpcPage | null> => {
    const admin = tryCreateAdminClient();
    if (!admin) throw new Error("no admin client");
    const { data, error } = await admin.rpc("get_public_trainer_page", { p_handle: handle });
    if (error) throw new Error(error.message);
    return data && typeof data === "object" ? (data as RpcPage) : null;
  },
  ["public-trainer-page"],
  { revalidate: PUBLIC_PAGE_TTL_S, tags: [PUBLIC_PAGE_TAG] },
);

/** Zlý handle / nepublikovaná / bez Business / chyba → null (v cache sa „nenájdené“ drží najviac 5 min alebo do uloženia trénera). */
export const loadPublicPage = cache(async (handle: string): Promise<PublicPageData | null> => {
  if (!isHandleShape(handle)) return null;
  try {
    const raw = await fetchPublicPageRaw(handle);
    return raw ? toPublicPage(raw) : null;
  } catch (err) {
    console.error("publicPage.loadPublicPage:", err instanceof Error ? err.message : "unknown");
    return null;
  }
});

/** Zoznam viditeľných stránok pre sitemap (prázdny pri chybe alebo bez service role). */
export async function listPublicPages(): Promise<{ handle: string; updatedAt: string | null }[]> {
  const admin = tryCreateAdminClient();
  if (!admin) return [];
  const { data, error } = await admin.rpc("list_public_trainer_pages");
  if (error) {
    console.error("publicPage.listPublicPages:", error.message);
    return [];
  }
  return arr(data)
    .map((r) => ({ handle: str(obj(r).handle), updatedAt: typeof obj(r).updated_at === "string" ? (obj(r).updated_at as string) : null }))
    .filter((r) => isHandleShape(r.handle));
}

const PROFILE_COLS = "handle, published, headline, bio, location, online, specializations, socials, updated_at";

/** Riadok stránky vrátane `template`; pred migráciou 0090 stĺpec chýba → dopyt sa zopakuje bez neho. */
async function loadOwnProfile(supabase: SupabaseClient, trainerId: string) {
  const full = await supabase.from("trainer_public_profiles").select(`${PROFILE_COLS}, template`).eq("trainer_id", trainerId).maybeSingle();
  if (!full.error) return full;
  if (!/template/i.test(full.error.message)) return full;
  return supabase.from("trainer_public_profiles").select(PROFILE_COLS).eq("trainer_id", trainerId).maybeSingle();
}

/** Vlastná stránka trénera (aj nepublikovaná) cez bežný klient a RLS — pre nastavenia a náhľad. */
export async function loadOwnPage(supabase: SupabaseClient, trainerId: string): Promise<{ page: PublicPageData | null; published: boolean; row: OwnRow | null }> {
  const [profile, services, gallery, testimonials, branding, trainerProfile] = await Promise.all([
    loadOwnProfile(supabase, trainerId),
    supabase.from("trainer_services").select("name, description, price_text").eq("trainer_id", trainerId).order("position"),
    supabase.from("trainer_gallery").select("id, path").eq("trainer_id", trainerId).order("position"),
    supabase.from("trainer_testimonials").select("author, body").eq("trainer_id", trainerId).order("position"),
    supabase.from("trainer_branding").select("brand_name, accent_color, logo_path, logo_dark_path, photo_path").eq("trainer_id", trainerId).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", trainerId).maybeSingle(),
  ]);
  if (profile.error) {
    // tabuľky ešte neexistujú (0083 nebehla) alebo výpadok → žiadna stránka
    console.error("publicPage.loadOwnPage:", profile.error.message);
    return { page: null, published: false, row: null };
  }
  const p = profile.data as Record<string, unknown> | null;
  if (!p) return { page: null, published: false, row: null };
  const b = (branding.data ?? {}) as Record<string, unknown>;
  const page = toPublicPage({
    ...p,
    display_name: str(b.brand_name) || str(obj(trainerProfile.data).full_name),
    accent_color: b.accent_color,
    logo_path: b.logo_path,
    logo_dark_path: b.logo_dark_path,
    photo_path: b.photo_path,
    services: services.data ?? [],
    gallery: ((gallery.data ?? []) as { path: string }[]).map((g) => g.path),
    testimonials: testimonials.data ?? [],
  });
  return { page, published: p.published === true, row: p as unknown as OwnRow };
}

export interface OwnRow {
  handle: string;
  published: boolean;
  headline: string;
  bio: string;
  location: string;
  online: boolean;
  specializations: string[];
  socials: Record<string, string>;
}
