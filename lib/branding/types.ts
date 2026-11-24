// FitPilot — tvary dát značky trénera (branding). Bez importov servera — použiteľné aj v klientskych komponentoch.

import type { BrandTheme } from "./colors";

/** Riadok trainer_branding (0075 + 0081) tak, ako ho vráti PostgREST. */
export interface BrandingRow {
  trainer_id: string;
  brand_name: string;
  accent_color: string | null;
  welcome_text: string;
  logo_path: string | null;
  photo_path: string | null;
  invite_slug: string | null;
  /** logo pre tmavé pozadie (0081) */
  logo_dark_path?: string | null;
  /** PNG ikony appky (0081) — generuje server z loga + farby */
  icon_192_path?: string | null;
  icon_512_path?: string | null;
  icon_maskable_path?: string | null;
  icon_apple_path?: string | null;
}

/** Verejné URL vygenerovaných ikon appky (manifest, apple-touch-icon, splash). */
export interface BrandIcons {
  i192: string;
  i512: string;
  maskable: string;
  apple: string;
}

/** Značka pripravená na zobrazenie klientovi / na pozvánke (len verejné polia). */
export interface PublicBranding {
  brandName: string;
  welcomeText: string;
  logoUrl: string | null;
  /** logo pre tmavé pozadie (null = použije sa `logoUrl` aj v tmavej téme) */
  logoDarkUrl?: string | null;
  photoUrl: string | null;
  /** null = tréner farbu nenastavil → ostáva farba FitPilot; ikony sú len pri nahratom logu */
  icons?: BrandIcons | null;
  /** null = tréner farbu nenastavil → ostáva farba FitPilot */
  theme: BrandTheme | null;
}
