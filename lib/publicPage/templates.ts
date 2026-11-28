// FitPilot — šablóny verejnej stránky trénera (bez importov servera, použiteľné aj v klientskych komponentoch).
// Šablóna mení LEN vzhľad: obsah (texty, služby, galéria, referencie, fotka, logo, farba) je vždy rovnaký,
// takže prepnutie o nič nepripraví. Šablóna = „recept“: poradie sekcií, variant každej sekcie a štýlové tokeny.
// Sekcie sú v app/t/sections/*, vykresľuje ich app/t/TrainerPublicPage.tsx podľa receptu.

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

export type SectionKind = "hero" | "about" | "services" | "gallery" | "testimonials" | "contact" | "socials" | "powered";

/** Povrch sekcie: karta (ako dnes), tenká čiara medzi sekciami, bez povrchu, jemné tónované pozadie. */
export type Surface = "card" | "rule" | "none" | "soft";

export interface SectionSpec {
  kind: SectionKind;
  /** variant sekcie — zoznam platných hodnôt je pri komponente sekcie */
  variant: string;
  surface?: Surface;
}

export interface TemplateRecipe {
  id: TemplateId;
  /** "auto" = podľa telefónu, "light"/"dark" = vždy */
  tone: "auto" | "light" | "dark";
  /** mierka zaoblenia (násobí sa v CSS) */
  radius: "sharp" | "normal" | "soft";
  /** hustota rozostupov */
  density: "compact" | "normal" | "airy";
  /** štýl nadpisov */
  heading: "normal" | "bold" | "light";
  sections: SectionSpec[];
}

export const TEMPLATES: Record<TemplateId, TemplateRecipe> = {
  klasik: {
    id: "klasik",
    tone: "auto",
    radius: "normal",
    density: "normal",
    heading: "normal",
    sections: [
      { kind: "hero", variant: "card", surface: "card" },
      { kind: "about", variant: "left", surface: "card" },
      { kind: "services", variant: "rows", surface: "card" },
      { kind: "gallery", variant: "grid", surface: "card" },
      { kind: "testimonials", variant: "grid", surface: "card" },
      { kind: "contact", variant: "form", surface: "card" },
      { kind: "socials", variant: "pills" },
      { kind: "powered", variant: "plain" },
    ],
  },
  sport: {
    id: "sport",
    tone: "dark",
    radius: "sharp",
    density: "compact",
    heading: "bold",
    sections: [
      { kind: "hero", variant: "cover", surface: "none" },
      { kind: "about", variant: "left", surface: "card" },
      { kind: "services", variant: "numbered", surface: "none" },
      { kind: "testimonials", variant: "scroll", surface: "none" },
      { kind: "gallery", variant: "strip", surface: "none" },
      { kind: "contact", variant: "form", surface: "card" },
      { kind: "socials", variant: "pills" },
      { kind: "powered", variant: "plain" },
    ],
  },
  minimal: {
    id: "minimal",
    tone: "light",
    radius: "normal",
    density: "airy",
    heading: "light",
    sections: [
      { kind: "hero", variant: "text", surface: "none" },
      { kind: "about", variant: "left", surface: "rule" },
      { kind: "services", variant: "list", surface: "rule" },
      { kind: "testimonials", variant: "stacked", surface: "rule" },
      { kind: "gallery", variant: "grid3", surface: "rule" },
      { kind: "contact", variant: "form", surface: "rule" },
      { kind: "socials", variant: "links" },
      { kind: "powered", variant: "plain" },
    ],
  },
  wellness: {
    id: "wellness",
    tone: "auto",
    radius: "soft",
    density: "airy",
    heading: "normal",
    sections: [
      { kind: "hero", variant: "split", surface: "none" },
      { kind: "about", variant: "centered", surface: "none" },
      { kind: "services", variant: "soft", surface: "none" },
      { kind: "gallery", variant: "mosaic", surface: "none" },
      { kind: "testimonials", variant: "soft", surface: "soft" },
      { kind: "contact", variant: "form", surface: "card" },
      { kind: "socials", variant: "pills" },
      { kind: "powered", variant: "plain" },
    ],
  },
};

export function recipeFor(id: TemplateId): TemplateRecipe {
  return TEMPLATES[id];
}
