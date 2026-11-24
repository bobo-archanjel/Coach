"use server";

// Verejná stránka trénera (tarifa Business) — uloženie obsahu, kontrola adresy, galéria.
// Server action je verejný endpoint, takže TU sa overuje všetko: session, rola tréner, tarifa Business
// (trainerBlock feature "branding"), limity pokusov, validácia (lib/publicPage/*), pri obrázkoch veľkosť,
// magic bytes a sharp re-encode (rovnaká cesta ako logo/fotka v brandingu). Zápis do DB ide cez RLS
// vlastného trénera (0083), do úložiska výhradne cez service role.

import { revalidatePath, revalidateTag } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient, getProfile } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { trainerBlock } from "@/lib/billing/server";
import { allowWithinWindow } from "@/lib/rateLimitMemory";
import { dbErr } from "@/lib/dbError";
import { MAX_UPLOAD_BYTES } from "@/lib/branding/validation";
import { processBrandImage, removeBrandImage, storeBrandImage } from "@/lib/branding/upload";
import { validateHandle } from "@/lib/publicPage/handle";
import { LIMITS, validateProfile } from "@/lib/publicPage/profile";
import { PUBLIC_PAGE_TAG } from "@/lib/publicPage/server";

export interface PublicPageState {
  error: string | null;
  saved: boolean;
  /** uložená adresa (po úspechu) */
  handle?: string;
}

export interface HandleCheckState {
  /** "free" = voľná, "own" = tvoja súčasná, "taken" = obsadená, "invalid" = zlý tvar; null = chyba */
  status: "free" | "own" | "taken" | "invalid" | null;
  error: string | null;
}

export interface GalleryState {
  error: string | null;
}

type Guard = { userId: string } | { error: string };

/** Spoločná stráž: prihlásený tréner s tarifou Business. */
async function requirePageTrainer(): Promise<Guard> {
  const t = await getTranslations("publicPage.settings.errors");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notSignedIn") };
  const { data: profile } = await getProfile(user.id);
  if (profile?.role !== "trainer") return { error: t("notTrainer") };
  const blocked = await trainerBlock({ feature: "branding" });
  if (blocked) return { error: blocked };
  return { userId: user.id };
}

const SOCIAL_LABEL: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", youtube: "YouTube", web: "Web" };

/** Zahodí cache verejnej stránky (dáta aj vykreslená cesta) po zmene. */
function refreshPublic(...handles: (string | null | undefined)[]) {
  revalidateTag(PUBLIC_PAGE_TAG);
  for (const h of new Set(handles.filter(Boolean))) revalidatePath(`/t/${h}`);
  revalidatePath("/sitemap.xml");
  revalidatePath("/dashboard/nastavenia");
}

/** Uloží celú stránku: adresa, zverejnenie, texty, odkazy, služby a referencie (jeden payload JSON). */
export async function savePublicPageAction(_prev: PublicPageState, formData: FormData): Promise<PublicPageState> {
  const t = await getTranslations("publicPage.settings.errors");
  const guard = await requirePageTrainer();
  if ("error" in guard) return { error: guard.error, saved: false };
  const trainerId = guard.userId;
  if (!allowWithinWindow(`public-page-save:${trainerId}`, 30, 10 * 60_000)) return { error: t("tooFast"), saved: false };

  const raw = formData.get("payload");
  if (typeof raw !== "string" || raw.length > 60_000) return { error: t("badData"), saved: false };
  let data: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { error: t("badData"), saved: false };
    data = parsed as Record<string, unknown>;
  } catch {
    return { error: t("badData"), saved: false };
  }

  const handle = validateHandle(data.handle);
  if (!handle.ok) return { error: t(handle.code), saved: false };
  const published = data.published === true;

  const profile = validateProfile({
    headline: data.headline,
    bio: data.bio,
    location: data.location,
    online: data.online,
    specializations: data.specializations,
    socials: data.socials,
    services: data.services,
    testimonials: data.testimonials,
  });
  if (!profile.ok) {
    const n = profile.index ?? 0;
    const network = profile.kind ? SOCIAL_LABEL[profile.kind] : "";
    return { error: t(profile.code, { n, network, max: LIMITS.specializationLen }), saved: false };
  }
  const v = profile.value;

  const supabase = await createClient();
  const { data: existing, error: readErr } = await supabase.from("trainer_public_profiles").select("handle").eq("trainer_id", trainerId).maybeSingle();
  if (readErr) return { error: await dbErr(readErr, "actions"), saved: false };
  const oldHandle = (existing?.handle as string | undefined) ?? null;

  const row = {
    trainer_id: trainerId,
    handle: handle.value,
    published,
    headline: v.headline,
    bio: v.bio,
    location: v.location,
    online: v.online,
    specializations: v.specializations,
    socials: v.socials,
    updated_at: new Date().toISOString(),
  };
  const { error } = existing
    ? await supabase.from("trainer_public_profiles").update(row).eq("trainer_id", trainerId)
    : await supabase.from("trainer_public_profiles").insert(row);
  if (error) {
    if (error.code === "23505") return { error: t("handleTaken"), saved: false };
    // CHECK na rezervované slová v DB (zhodný zoznam s aplikáciou) — rovnaká hláška ako pri kontrole v appke
    if (error.code === "23514" && /handle/.test(`${error.message} ${error.details ?? ""}`)) return { error: t("handleReserved"), saved: false };
    return { error: await dbErr(error, "actions"), saved: false };
  }

  // služby a referencie: upsert podľa pozície + zmazanie prebytočných (nikdy nie „zmaž všetko a vlož“ — chyba v polovici by stratila dáta)
  const { error: svcErr } = await syncList(supabase, "trainer_services", trainerId, v.services.map((s, i) => ({ trainer_id: trainerId, position: i, name: s.name, description: s.description, price_text: s.priceText })));
  if (svcErr) return { error: await dbErr(svcErr, "actions"), saved: false };
  const { error: tErr } = await syncList(supabase, "trainer_testimonials", trainerId, v.testimonials.map((r, i) => ({ trainer_id: trainerId, position: i, author: r.author, body: r.body })));
  if (tErr) return { error: await dbErr(tErr, "actions"), saved: false };

  refreshPublic(handle.value, oldHandle);
  return { error: null, saved: true, handle: handle.value };
}

async function syncList(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "trainer_services" | "trainer_testimonials",
  trainerId: string,
  rows: Record<string, unknown>[],
): Promise<{ error: { message?: string; code?: string } | null }> {
  if (rows.length > 0) {
    const { error } = await supabase.from(table).upsert(rows, { onConflict: "trainer_id,position" });
    if (error) return { error };
  }
  const { error } = await supabase.from(table).delete().eq("trainer_id", trainerId).gte("position", rows.length);
  return { error };
}

/** Kontrola dostupnosti adresy (rezervované/obsadené). Limit na trénera; ostatným sa nič neprezrádza okrem „obsadená“. */
export async function checkHandleAction(raw: string): Promise<HandleCheckState> {
  const guard = await requirePageTrainer();
  if ("error" in guard) return { status: null, error: guard.error };
  const t = await getTranslations("publicPage.settings.errors");
  if (!allowWithinWindow(`public-page-handle:${guard.userId}`, 40, 10 * 60_000)) return { status: null, error: t("tooFast") };
  const parsed = validateHandle(raw);
  if (!parsed.ok) return { status: "invalid", error: t(parsed.code) };
  const admin = tryCreateAdminClient();
  if (!admin) return { status: null, error: t("unavailable") };
  const { data, error } = await admin.from("trainer_public_profiles").select("trainer_id").eq("handle", parsed.value).maybeSingle();
  if (error) {
    console.error("publicPage.checkHandle:", error.message);
    return { status: null, error: t("unavailable") };
  }
  if (!data) return { status: "free", error: null };
  return { status: (data.trainer_id as string) === guard.userId ? "own" : "taken", error: null };
}

/** Nahrá jednu fotku do galérie (max. 6). Súbor sa overí, zmenší a znovu zakóduje; názov generuje server. */
export async function uploadGalleryPhotoAction(formData: FormData): Promise<GalleryState> {
  const t = await getTranslations("publicPage.settings.errors");
  const guard = await requirePageTrainer();
  if ("error" in guard) return { error: guard.error };
  const trainerId = guard.userId;
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: t("badType") };
  if (file.size > MAX_UPLOAD_BYTES) return { error: t("tooLarge") };
  if (!allowWithinWindow(`public-page-gallery:${trainerId}`, 15, 10 * 60_000)) return { error: t("tooFast") };

  const supabase = await createClient();
  const { data: rows, error: readErr } = await supabase.from("trainer_gallery").select("position").eq("trainer_id", trainerId);
  if (readErr) return { error: await dbErr(readErr, "actions") };
  const used = new Set((rows ?? []).map((r) => r.position as number));
  if (used.size >= LIMITS.gallery) return { error: t("galleryFull") };
  let position = 0;
  while (used.has(position)) position++;

  const admin = tryCreateAdminClient();
  if (!admin) return { error: t("unavailable") };
  const processed = await processBrandImage(new Uint8Array(await file.arrayBuffer()), "gallery");
  if (!processed.ok) return { error: t(processed.error) };
  const stored = await storeBrandImage(admin, trainerId, "gallery", processed.webp, null);
  if ("error" in stored) {
    console.error("publicPage.gallery upload:", stored.error);
    return { error: t("unavailable") };
  }
  const { error } = await supabase.from("trainer_gallery").insert({ trainer_id: trainerId, position, path: stored.path });
  if (error) {
    await removeBrandImage(admin, trainerId, "gallery", stored.path);
    return { error: await dbErr(error, "actions") };
  }
  const handle = await ownHandle(supabase, trainerId);
  refreshPublic(handle);
  return { error: null };
}

/** Zmaže fotku z galérie (riadok aj súbor) — len vlastnú. */
export async function removeGalleryPhotoAction(id: string): Promise<GalleryState> {
  const guard = await requirePageTrainer();
  if ("error" in guard) return { error: guard.error };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return { error: null };
  const supabase = await createClient();
  const { data: row } = await supabase.from("trainer_gallery").select("path").eq("id", id).eq("trainer_id", guard.userId).maybeSingle();
  if (!row) return { error: null };
  const { error } = await supabase.from("trainer_gallery").delete().eq("id", id).eq("trainer_id", guard.userId);
  if (error) return { error: await dbErr(error, "actions") };
  const admin = tryCreateAdminClient();
  if (admin) await removeBrandImage(admin, guard.userId, "gallery", row.path as string);
  refreshPublic(await ownHandle(supabase, guard.userId));
  return { error: null };
}

async function ownHandle(supabase: Awaited<ReturnType<typeof createClient>>, trainerId: string): Promise<string | null> {
  const { data } = await supabase.from("trainer_public_profiles").select("handle").eq("trainer_id", trainerId).maybeSingle();
  return (data?.handle as string | undefined) ?? null;
}
