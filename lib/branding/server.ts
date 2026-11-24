import "server-only";
import { cache } from "react";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { brandingAvailableForClients, type SubscriptionRow } from "@/lib/billing/entitlements";
import { deriveBrandTheme } from "./colors";
import { cleanLine, cleanMultiline } from "./validation";
import { isOwnBrandPath, isOwnIconPath, type BrandImageKind, type IconVariant } from "./image";
import type { BrandingRow, PublicBranding } from "./types";

export const BRANDING_BUCKET = "branding";

const SUB_COLUMNS =
  "trainer_id, stripe_customer_id, stripe_subscription_id, tier, status, trial_ends_at, current_period_end, cancel_at_period_end, past_due_since, comped, client_limit, scheduled_tier, scheduled_client_limit, scheduled_change_at";

/** Verejná URL objektu v buckete `branding` (bucket je public, viď 0075). */
export function brandingPublicUrl(path: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!path || !base) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${BRANDING_BUCKET}/${path}`;
}

/** Stĺpce značky pred 0081 (poistka: ak migrácia ešte nebehla, značka sa zobrazí bez ikon a tmavého loga). */
const LEGACY_COLUMNS = "brand_name, welcome_text, accent_color, logo_path, photo_path";
const BRANDING_COLUMNS = `${LEGACY_COLUMNS}, logo_dark_path, icon_192_path, icon_512_path, icon_maskable_path, icon_apple_path`;

type BrandingFields = Pick<BrandingRow, "brand_name" | "welcome_text" | "accent_color" | "logo_path" | "photo_path"> &
  Partial<Pick<BrandingRow, "logo_dark_path" | "icon_192_path" | "icon_512_path" | "icon_maskable_path" | "icon_apple_path">>;

/** Zloží zobraziteľnú značku z riadka (vstupy z DB sa pre istotu čistia ešte raz). */
export function toPublicBranding(row: BrandingFields, trainerId?: string): PublicBranding {
  // cesty z DB sa overujú proti tvaru (a, ak je známy tréner, aj proti jeho priečinku)
  const okPath = (p: string | null | undefined, kind: BrandImageKind) =>
    p && (trainerId ? isOwnBrandPath(trainerId, p, kind) : new RegExp(`^[0-9a-f-]{36}/${kind}-[0-9a-f-]{36}\\.webp$`).test(p)) ? p : null;
  const okIcon = (p: string | null | undefined, variant: IconVariant) => (trainerId && isOwnIconPath(trainerId, p, variant) ? p : null);
  const icon = {
    i192: brandingPublicUrl(okIcon(row.icon_192_path, "192")),
    i512: brandingPublicUrl(okIcon(row.icon_512_path, "512")),
    maskable: brandingPublicUrl(okIcon(row.icon_maskable_path, "maskable")),
    apple: brandingPublicUrl(okIcon(row.icon_apple_path, "apple")),
  };
  // ikony sa berú len celé (všetky štyri) — polovičná sada by dala manifest s chýbajúcou ikonou
  const icons = icon.i192 && icon.i512 && icon.maskable && icon.apple ? { i192: icon.i192, i512: icon.i512, maskable: icon.maskable, apple: icon.apple } : null;
  return {
    brandName: cleanLine(row.brand_name),
    welcomeText: cleanMultiline(row.welcome_text),
    logoUrl: brandingPublicUrl(okPath(row.logo_path, "logo")),
    logoDarkUrl: brandingPublicUrl(okPath(row.logo_dark_path, "logodark")),
    photoUrl: brandingPublicUrl(okPath(row.photo_path, "photo")),
    icons,
    theme: deriveBrandTheme(row.accent_color),
  };
}

/**
 * Značka trénera pre jeho KLIENTOV (portál, PDF). Číta cez service role (klient riadok
 * predplatného cez RLS nevidí; výsledok sú len verejné polia). `null` = ukáž FitPilot:
 * bez trénera, tréner nemá Business (odkaz sa potichu vypne, dáta ostávajú), tréner značku
 * nenastavil alebo chyba (fail-closed na predvolený vzhľad).
 * Volajúci MUSÍ trainerId zistiť sám z overeného vzťahu (clients.trainer_id prihláseného klienta
 * alebo plán, ku ktorému má prístup) — funkcia sama nič o volajúcom neoveruje.
 */
export const loadBrandingForTrainer = cache(async (trainerId: string | null | undefined): Promise<PublicBranding | null> => {
  if (!trainerId) return null;
  const admin = tryCreateAdminClient();
  if (!admin) return null;
  const readRow = (columns: string) => admin.from("trainer_branding").select(columns).eq("trainer_id", trainerId).maybeSingle();
  const [{ data: sub, error: subErr }, first] = await Promise.all([
    admin.from("trainer_subscriptions").select(SUB_COLUMNS).eq("trainer_id", trainerId).maybeSingle(),
    readRow(BRANDING_COLUMNS),
  ]);
  // 0081 ešte nebehla (neznámy stĺpec) → zopakovať so starými stĺpcami, značka sa ukáže bez ikon
  const second = first.error ? await readRow(LEGACY_COLUMNS) : null;
  const rowErr = second ? second.error : first.error;
  const row = (second ? second.data : first.data) as unknown as BrandingFields | null;
  if (subErr || rowErr) {
    // tabuľka ešte neexistuje (0075 nebehla) alebo výpadok → predvolený vzhľad
    console.error("branding.loadBrandingForTrainer:", (subErr ?? rowErr)?.message);
    return null;
  }
  if (!row || !brandingAvailableForClients((sub as SubscriptionRow | null) ?? null)) return null;
  const branding = toPublicBranding(row, trainerId);
  // prázdna značka (nič nenastavené) = predvolený FitPilot
  if (!branding.brandName && !branding.logoUrl && !branding.theme) return null;
  return branding;
});

/** Značka podľa tajného odkazu pozvánky (RPC len pre service role, 0075). `null` = generická „nenájdené“. */
export async function loadBrandingByInviteSlug(slug: string): Promise<PublicBranding | null> {
  if (!/^[a-f0-9]{20}$/.test(slug)) return null;
  const admin = tryCreateAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.rpc("get_invite_branding", { p_slug: slug });
  if (error) {
    console.error("branding.loadBrandingByInviteSlug:", error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  return toPublicBranding(row as BrandingRow);
}
