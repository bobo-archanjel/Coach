// FitPilot — šablóny verejnej stránky trénera (bez importov servera, použiteľné aj v klientskych komponentoch).
// Šablóna mení LEN vzhľad: obsah (texty, služby, galéria, referencie, fotka, logo, farba) je vždy rovnaký,
// takže prepnutie o nič nepripraví. Šablóna = „recept“ samostatného webu trénera: pevný tón (svetlý / tmavý),
// poradie sekcií a ich variant. Farby, písma a tvary sú v app/t/site.module.css (podľa data-template),
// písma v app/t/fonts.ts. Sekcie sú v app/t/sections/*, vykresľuje ich app/t/TrainerPublicPage.tsx podľa receptu.
// Hlavička (navigácia) a päta nie sú v recepte — sú súčasťou každej šablóny.

export const TEMPLATE_IDS = ["klasik", "sport", "minimal", "wellness"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];
export const DEFAULT_TEMPLATE: TemplateId = "klasik";

export function isTemplateId(v: unknown): v is TemplateId {
  return typeof v === "string" && (TEMPLATE_IDS as readonly string[]).includes(v);
}

/** Neplatná / chýbajúca hodnota (napr. pred migráciou 0090) → predvolená šablóna. */
export function coerceTemplate(v: unknown): TemplateId {
  return isTemplateId(v) ? v : DEFAULT_TEMPLATE;
}

import type { PublicPageData } from "./types";

/** Sekcie obsahu webu (hlavička s navigáciou a päta sú pevné). */
export type SectionKind = "hero" | "about" | "services" | "testimonials" | "gallery" | "contact";

export interface SectionSpec {
  kind: SectionKind;
  /** variant sekcie — CSS ho číta z data-variant (zoznam platných hodnôt je pri komponente sekcie) */
  variant: string;
}

export interface TemplateRecipe {
  id: TemplateId;
  /** pevný tón šablóny — nezávisí od témy aplikácie ani telefónu (stránka sa kešuje, bez cookie) */
  tone: "light" | "dark";
  sections: SectionSpec[];
}

export const TEMPLATES: Record<TemplateId, TemplateRecipe> = {
  // dôveryhodný profesionálny web: dvojstĺpcový hrdina, cenník v 3 kartách, referencie na tónovanom páse
  klasik: {
    id: "klasik",
    tone: "light",
    sections: [
      { kind: "hero", variant: "split" },
      { kind: "about", variant: "split" },
      { kind: "services", variant: "cards" },
      { kind: "testimonials", variant: "cards" },
      { kind: "gallery", variant: "grid" },
      { kind: "contact", variant: "split" },
    ],
  },
  // gym značka: fotka na celú šírku, veľké verzálky, číslované služby, ostré rohy
  sport: {
    id: "sport",
    tone: "dark",
    sections: [
      { kind: "hero", variant: "cover" },
      { kind: "about", variant: "split" },
      { kind: "services", variant: "numbered" },
      { kind: "gallery", variant: "tall" },
      { kind: "testimonials", variant: "bars" },
      { kind: "contact", variant: "split" },
    ],
  },
  // časopisecký, pokojný a prémiový: serif nadpisy, cenník ako zoznam, veľké citáty
  minimal: {
    id: "minimal",
    tone: "light",
    sections: [
      { kind: "hero", variant: "editorial" },
      { kind: "about", variant: "editorial" },
      { kind: "services", variant: "list" },
      { kind: "testimonials", variant: "quotes" },
      { kind: "gallery", variant: "grid" },
      { kind: "contact", variant: "editorial" },
    ],
  },
  // mäkký a teplý: oblúková fotka, zaoblené karty, mozaika
  wellness: {
    id: "wellness",
    tone: "light",
    sections: [
      { kind: "hero", variant: "arch" },
      { kind: "about", variant: "centered" },
      { kind: "services", variant: "soft" },
      { kind: "testimonials", variant: "soft" },
      { kind: "gallery", variant: "mosaic" },
      { kind: "contact", variant: "soft" },
    ],
  },
};

export function recipeFor(id: TemplateId): TemplateRecipe {
  return TEMPLATES[id];
}

/** Id kotvy sekcie (navigácia, `#kontakt` vedie z hrdinu aj z tlačidla v lište). */
export const SECTION_ANCHOR: Record<SectionKind, string> = {
  hero: "top",
  about: "o-mne",
  services: "sluzby",
  testimonials: "referencie",
  gallery: "galeria",
  contact: "kontakt",
};

/** Má sekcia čo ukázať? Sekcie bez dát sa nevykreslia a nie sú ani v navigácii. */
export function hasSectionData(kind: SectionKind, page: PublicPageData): boolean {
  switch (kind) {
    case "about":
      return page.bio.length > 0 || page.specializations.length > 0;
    case "services":
      return page.services.length > 0;
    case "testimonials":
      return page.testimonials.length > 0;
    case "gallery":
      return page.galleryUrls.length > 0;
    default:
      return true;
  }
}

/** Sekcie receptu, ktoré sa pre danú stránku skutočne vykreslia (v poradí šablóny). */
export function visibleSections(recipe: TemplateRecipe, page: PublicPageData): SectionSpec[] {
  return recipe.sections.filter((s) => hasSectionData(s.kind, page));
}
