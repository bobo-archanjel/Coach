// FitPilot — tvary dát verejnej stránky trénera (bez importov servera, použiteľné aj v klientskych komponentoch).

import type { BrandTheme } from "@/lib/branding/colors";
import type { Socials } from "./socials";
import type { TemplateId } from "./templates";

export interface PublicService {
  name: string;
  description: string;
  priceText: string;
}

export interface PublicTestimonial {
  author: string;
  body: string;
}

/** Všetko, čo sa ukáže návštevníkovi — nikdy trainer_id, e-mail ani niečo interné. */
export interface PublicPageData {
  handle: string;
  /** názov značky, inak meno trénera */
  displayName: string;
  headline: string;
  bio: string;
  location: string;
  online: boolean;
  specializations: string[];
  socials: Socials;
  services: PublicService[];
  testimonials: PublicTestimonial[];
  galleryUrls: string[];
  logoUrl: string | null;
  logoDarkUrl: string | null;
  photoUrl: string | null;
  theme: BrandTheme | null;
  /** vzhľad stránky (mení len prezentáciu, nie obsah) */
  template: TemplateId;
  updatedAt: string | null;
}
