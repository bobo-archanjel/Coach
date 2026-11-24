// FitPilot — tvary dát značky trénera (branding). Bez importov servera — použiteľné aj v klientskych komponentoch.

import type { BrandTheme } from "./colors";

/** Riadok trainer_branding (0075) tak, ako ho vráti PostgREST. */
export interface BrandingRow {
  trainer_id: string;
  brand_name: string;
  accent_color: string | null;
  welcome_text: string;
  logo_path: string | null;
  photo_path: string | null;
  invite_slug: string | null;
}

/** Značka pripravená na zobrazenie klientovi / na pozvánke (len verejné polia). */
export interface PublicBranding {
  brandName: string;
  welcomeText: string;
  logoUrl: string | null;
  photoUrl: string | null;
  /** null = tréner farbu nenastavil → ostáva farba FitPilot */
  theme: BrandTheme | null;
}
