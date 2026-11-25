"use server";

// Branding trénera (tarifa Business) — uloženie značky a nahrávanie loga/fotky.
// Server action je verejný endpoint, takže TU sa overuje všetko: session, rola tréner,
// tarifa Business (trainerBlock feature "branding"), limit pokusov, veľkosť, magic bytes,
// znovu-zakódovanie (sharp) a názov objektu generuje server. Zápis do úložiska ide výhradne
// cez service role (0075 — na storage.objects nie je žiadna politika zápisu pre používateľov).

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient, getProfile } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { trainerBlock } from "@/lib/billing/server";
import { allowWithinWindow } from "@/lib/rateLimitMemory";
import { BRAND_NAME_MAX, MAX_UPLOAD_BYTES, WELCOME_TEXT_MAX, validateBranding } from "@/lib/branding/validation";
import { downloadBrandLogo, processBrandImage, removeAppIcons, removeBrandImage, storeAppIcons, storeBrandImage, type IconPaths } from "@/lib/branding/upload";
import { paletteFromLogo } from "@/lib/branding/appIcons";
import { ICON_VARIANTS, type BrandImageKind, type IconVariant } from "@/lib/branding/image";
import { dbErr } from "@/lib/dbError";

export interface BrandingState {
  error: string | null;
  saved: boolean;
  /** návrhy akcentu z loga (3–5 × #rrggbb) — po uložení nového loga; inak prázdne */
  palette?: string[];
}

export interface PaletteState {
  error: string | null;
  palette: string[];
}

/** Stĺpce s ikonami v DB podľa variantu. */
const ICON_COLUMNS = {
  "192": "icon_192_path",
  "512": "icon_512_path",
  maskable: "icon_maskable_path",
  apple: "icon_apple_path",
} as const satisfies Record<IconVariant, string>;

/** 80 bitov z CSPRNG — odkaz pozvánky sa nedá uhádnuť ani enumerovať. */
function newInviteSlug(): string {
  return randomBytes(10).toString("hex");
}

/** Spoločná stráž: prihlásený tréner s tarifou Business. Vráti userId alebo chybu. */
async function requireBrandingTrainer(): Promise<{ userId: string } | { error: string }> {
  const t = await getTranslations("branding.errors");
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

function fileOf(formData: FormData, name: string): File | null {
  const v = formData.get(name);
  return v instanceof File && v.size > 0 ? v : null;
}

export async function saveBrandingAction(_prev: BrandingState, formData: FormData): Promise<BrandingState> {
  const t = await getTranslations("branding.errors");
  const guard = await requireBrandingTrainer();
  if ("error" in guard) return { error: guard.error, saved: false };
  const trainerId = guard.userId;

  const parsed = validateBranding({
    brandName: formData.get("brand_name"),
    welcomeText: formData.get("welcome_text"),
    accent: formData.get("accent"),
  });
  if (!parsed.ok) return { error: t(parsed.code, { max: parsed.code === "welcomeTooLong" ? WELCOME_TEXT_MAX : BRAND_NAME_MAX }), saved: false };

  const logo = fileOf(formData, "logo");
  const logoDark = fileOf(formData, "logo_dark");
  const photo = fileOf(formData, "photo");
  const removeLogo = formData.get("remove_logo") === "1";
  const removeLogoDark = formData.get("remove_logo_dark") === "1";
  const removePhoto = formData.get("remove_photo") === "1";

  // nahrávanie je drahé (dekódovanie obrázka, generovanie ikon) — limit na trénera
  if ((logo || logoDark || photo) && !allowWithinWindow(`branding-upload:${trainerId}`, 12, 10 * 60_000)) {
    return { error: t("tooManyUploads"), saved: false };
  }
  for (const f of [logo, logoDark, photo]) {
    if (f && f.size > MAX_UPLOAD_BYTES) return { error: t("tooLarge"), saved: false };
  }

  const supabase = await createClient();
  const { data: existing, error: readErr } = await supabase
    .from("trainer_branding")
    .select("trainer_id, accent_color, logo_path, logo_dark_path, photo_path, invite_slug, icon_192_path, icon_512_path, icon_maskable_path, icon_apple_path")
    .eq("trainer_id", trainerId)
    .maybeSingle();
  if (readErr) return { error: await dbErr(readErr, "actions"), saved: false };

  const admin = tryCreateAdminClient();
  if (!admin && (logo || logoDark || photo || removeLogo || removeLogoDark || removePhoto)) return { error: t("storageUnavailable"), saved: false };

  // obrázky: najprv overiť a znovu zakódovať OBA (nech zlý druhý súbor nenechá po prvom sirotu v úložisku)
  const processed: Partial<Record<BrandImageKind, Buffer>> = {};
  for (const [kind, file] of [["logo", logo], ["logodark", logoDark], ["photo", photo]] as const) {
    if (!file) continue;
    const res = await processBrandImage(new Uint8Array(await file.arrayBuffer()), kind);
    if (!res.ok) return { error: t(res.error), saved: false };
    processed[kind] = res.webp;
  }

  let logoPath = (existing?.logo_path as string | null | undefined) ?? null;
  let logoDarkPath = (existing?.logo_dark_path as string | null | undefined) ?? null;
  let photoPath = (existing?.photo_path as string | null | undefined) ?? null;
  const oldLogo = logoPath;
  const oldLogoDark = logoDarkPath;
  const oldPhoto = photoPath;
  const oldIcons: Partial<Record<IconVariant, string | null>> = {};
  for (const v of ICON_VARIANTS) oldIcons[v] = (existing?.[ICON_COLUMNS[v]] as string | null | undefined) ?? null;
  const uploaded: { kind: BrandImageKind; path: string }[] = [];

  if (admin) {
    for (const kind of ["logo", "logodark", "photo"] as const) {
      const webp = processed[kind];
      if (!webp) continue;
      const stored = await storeBrandImage(admin, trainerId, kind, webp, null);
      if ("error" in stored) {
        // vrátiť už nahraté súbory tohto volania
        for (const u of uploaded) await removeBrandImage(admin, trainerId, u.kind, u.path);
        console.error("branding.save upload:", stored.error);
        return { error: t("storageUnavailable"), saved: false };
      }
      uploaded.push({ kind, path: stored.path });
      if (kind === "logo") logoPath = stored.path;
      else if (kind === "logodark") logoDarkPath = stored.path;
      else photoPath = stored.path;
    }
  }
  if (removeLogo && !processed.logo) logoPath = null;
  if (removeLogoDark && !processed.logodark) logoDarkPath = null;
  if (removePhoto && !processed.photo) photoPath = null;

  // Ikony appky (manifest, apple-touch-icon): znova sa generujú pri novom logu, zmene farby
  // alebo keď ešte neexistujú; bez loga sa zmažú (manifest potom použije ikony FitPilot).
  let iconPaths: Partial<Record<IconVariant, string | null>> = { ...oldIcons };
  let newIcons: IconPaths | null = null;
  if (admin) {
    const hadIcons = ICON_VARIANTS.every((v) => oldIcons[v]);
    const accentChanged = ((existing?.accent_color as string | null | undefined) ?? null) !== parsed.value.accent;
    if (!logoPath) {
      iconPaths = {};
    } else if (processed.logo || accentChanged || !hadIcons) {
      const source = processed.logo ?? (await downloadBrandLogo(admin, trainerId, logoPath));
      const made = source ? await storeAppIcons(admin, trainerId, source, parsed.value.accent) : null;
      if (made && "paths" in made) {
        newIcons = made.paths;
        iconPaths = made.paths;
      } else {
        if (made) console.error("branding.save icons:", made.error);
        // staré ikony zodpovedajú starému logu — pri novom logu radšej žiadne než zlé
        if (processed.logo) iconPaths = {};
      }
    }
  }
  const payload = {
    trainer_id: trainerId,
    brand_name: parsed.value.brandName,
    welcome_text: parsed.value.welcomeText,
    accent_color: parsed.value.accent,
    logo_path: logoPath,
    logo_dark_path: logoDarkPath,
    photo_path: photoPath,
    icon_192_path: iconPaths["192"] ?? null,
    icon_512_path: iconPaths["512"] ?? null,
    icon_maskable_path: iconPaths.maskable ?? null,
    icon_apple_path: iconPaths.apple ?? null,
    invite_slug: (existing?.invite_slug as string | null | undefined) ?? newInviteSlug(),
    updated_at: new Date().toISOString(),
  };
  const { error } = existing
    ? await supabase.from("trainer_branding").update(payload).eq("trainer_id", trainerId)
    : await supabase.from("trainer_branding").insert(payload);
  if (error) {
    if (admin) {
      for (const u of uploaded) await removeBrandImage(admin, trainerId, u.kind, u.path);
      if (newIcons) await removeAppIcons(admin, trainerId, newIcons);
    }
    return { error: await dbErr(error, "actions"), saved: false };
  }

  // po úspešnom zápise do DB zmazať nahradené/odstránené súbory
  if (admin) {
    if (oldLogo && oldLogo !== logoPath) await removeBrandImage(admin, trainerId, "logo", oldLogo);
    if (oldLogoDark && oldLogoDark !== logoDarkPath) await removeBrandImage(admin, trainerId, "logodark", oldLogoDark);
    if (oldPhoto && oldPhoto !== photoPath) await removeBrandImage(admin, trainerId, "photo", oldPhoto);
    // nahradené/odstránené ikony (po úspešnom zápise; nezmenené sa nemažú)
    const stale: Partial<Record<IconVariant, string | null>> = {};
    for (const v of ICON_VARIANTS) if (oldIcons[v] && oldIcons[v] !== iconPaths[v]) stale[v] = oldIcons[v];
    await removeAppIcons(admin, trainerId, stale);
  }

  revalidatePath("/dashboard/nastavenia");
  revalidatePath("/portal", "layout");
  // tréner vidí svoju značku aj v dashboarde (bočný panel, akcent) — hneď po uložení
  revalidatePath("/dashboard", "layout");
  const palette = processed.logo ? await paletteFromLogo(processed.logo) : [];
  return { error: null, saved: true, palette };
}

/**
 * „Farby z tvojho loga“: po výbere súboru vráti 3–5 dominantných farieb (bez bielej, čiernej
 * a priehľadnej) ako návrhy akcentu. Nič neukladá. Rovnaká overovacia cesta ako nahrávanie
 * (tarifa Business, limit pokusov, veľkosť, magic bytes, sharp s limitom pixelov).
 */
export async function suggestPaletteAction(formData: FormData): Promise<PaletteState> {
  const t = await getTranslations("branding.errors");
  const guard = await requireBrandingTrainer();
  if ("error" in guard) return { error: guard.error, palette: [] };
  const logo = fileOf(formData, "logo");
  if (!logo) return { error: null, palette: [] };
  if (!allowWithinWindow(`branding-palette:${guard.userId}`, 20, 10 * 60_000)) return { error: t("tooManyUploads"), palette: [] };
  if (logo.size > MAX_UPLOAD_BYTES) return { error: t("tooLarge"), palette: [] };
  const res = await processBrandImage(new Uint8Array(await logo.arrayBuffer()), "logo");
  if (!res.ok) return { error: t(res.error), palette: [] };
  return { error: null, palette: await paletteFromLogo(res.webp) };
}

/** Nový odkaz pozvánky — starý prestane fungovať (napr. keď sa odkaz dostal na zlé miesto). */
export async function regenerateInviteLinkAction(): Promise<{ error: string | null }> {
  const guard = await requireBrandingTrainer();
  if ("error" in guard) return { error: guard.error };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("trainer_branding").select("trainer_id").eq("trainer_id", guard.userId).maybeSingle();
  if (!existing) {
    const t = await getTranslations("branding.errors");
    return { error: t("saveFirst") };
  }
  const { error } = await supabase
    .from("trainer_branding")
    .update({ invite_slug: newInviteSlug(), updated_at: new Date().toISOString() })
    .eq("trainer_id", guard.userId);
  if (error) return { error: await dbErr(error, "actions") };
  revalidatePath("/dashboard/nastavenia");
  return { error: null };
}
