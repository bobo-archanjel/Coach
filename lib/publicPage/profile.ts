// FitPilot — validácia obsahu verejnej stránky trénera (nadpis, bio, služby, referencie…). Čistý modul
// (testy: e2e/public-page.spec.ts). Všetko je obyčajný text — žiadne HTML ani markdown; React ho pri vykreslení
// escapuje a zalomenia riadkov sa zobrazujú CSS (white-space: pre-line). Limity zrkadlí CHECK v migrácii 0083.

import { charLength, cleanLine, cleanMultiline } from "@/lib/branding/validation";
import { validateSocials, type Socials, type SocialKind } from "./socials";

export const LIMITS = {
  headline: 120,
  bio: 1500,
  location: 80,
  specializations: 8,
  specializationLen: 30,
  services: 6,
  serviceName: 60,
  serviceDesc: 300,
  servicePrice: 40,
  gallery: 6,
  testimonials: 6,
  testimonialAuthor: 40,
  testimonialBody: 400,
} as const;

export type ProfileErrorCode =
  | "headlineTooLong"
  | "bioTooLong"
  | "locationTooLong"
  | "tooManySpecializations"
  | "specializationTooLong"
  | "tooManyServices"
  | "serviceNameRequired"
  | "serviceNameTooLong"
  | "serviceDescTooLong"
  | "servicePriceTooLong"
  | "tooManyTestimonials"
  | "testimonialAuthorRequired"
  | "testimonialAuthorTooLong"
  | "testimonialBodyRequired"
  | "testimonialBodyTooLong"
  | "socialInvalid"
  | "socialHost";

export interface ServiceInput {
  name: string;
  description: string;
  priceText: string;
}

export interface TestimonialInput {
  author: string;
  body: string;
}

export interface ProfileInput {
  headline: string;
  bio: string;
  location: string;
  online: boolean;
  specializations: string[];
  socials: Socials;
  services: ServiceInput[];
  testimonials: TestimonialInput[];
}

export type ProfileValidation =
  | { ok: true; value: ProfileInput }
  | { ok: false; code: ProfileErrorCode; /** sieť, ktorej sa týka chyba odkazu */ kind?: SocialKind; /** poradie položky (od 1) pri chybe v zozname */ index?: number };

/** Zoznam z textu (po riadkoch alebo čiarkach), bez prázdnych a duplicít (bez ohľadu na veľkosť písmen). */
export function parseTags(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[\n,]/) : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const tag = cleanLine(item);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
  }
  return out;
}

export function validateProfile(raw: {
  headline: unknown;
  bio: unknown;
  location: unknown;
  online: unknown;
  specializations: unknown;
  socials: unknown;
  services: unknown;
  testimonials: unknown;
}): ProfileValidation {
  const headline = cleanLine(raw.headline);
  if (charLength(headline) > LIMITS.headline) return { ok: false, code: "headlineTooLong" };
  const bio = cleanMultiline(raw.bio);
  if (charLength(bio) > LIMITS.bio) return { ok: false, code: "bioTooLong" };
  const location = cleanLine(raw.location);
  if (charLength(location) > LIMITS.location) return { ok: false, code: "locationTooLong" };

  const specializations = parseTags(raw.specializations);
  if (specializations.length > LIMITS.specializations) return { ok: false, code: "tooManySpecializations" };
  if (specializations.some((s) => charLength(s) > LIMITS.specializationLen)) return { ok: false, code: "specializationTooLong" };

  const socials = validateSocials(raw.socials);
  if (!socials.ok) return { ok: false, code: socials.code, kind: socials.kind };

  // služby: prázdne riadky (bez názvu, popisu aj ceny) sa vynechajú
  const servicesRaw = Array.isArray(raw.services) ? (raw.services as unknown[]) : [];
  const services: ServiceInput[] = [];
  for (const item of servicesRaw) {
    const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const s = { name: cleanLine(o.name), description: cleanMultiline(o.description), priceText: cleanLine(o.priceText) };
    if (!s.name && !s.description && !s.priceText) continue;
    services.push(s);
  }
  if (services.length > LIMITS.services) return { ok: false, code: "tooManyServices" };
  for (const [i, s] of services.entries()) {
    if (!s.name) return { ok: false, code: "serviceNameRequired", index: i + 1 };
    if (charLength(s.name) > LIMITS.serviceName) return { ok: false, code: "serviceNameTooLong", index: i + 1 };
    if (charLength(s.description) > LIMITS.serviceDesc) return { ok: false, code: "serviceDescTooLong", index: i + 1 };
    if (charLength(s.priceText) > LIMITS.servicePrice) return { ok: false, code: "servicePriceTooLong", index: i + 1 };
  }

  const testimonialsRaw = Array.isArray(raw.testimonials) ? (raw.testimonials as unknown[]) : [];
  const testimonials: TestimonialInput[] = [];
  for (const item of testimonialsRaw) {
    const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const t = { author: cleanLine(o.author), body: cleanMultiline(o.body) };
    if (!t.author && !t.body) continue;
    testimonials.push(t);
  }
  if (testimonials.length > LIMITS.testimonials) return { ok: false, code: "tooManyTestimonials" };
  for (const [i, t] of testimonials.entries()) {
    if (!t.author) return { ok: false, code: "testimonialAuthorRequired", index: i + 1 };
    if (charLength(t.author) > LIMITS.testimonialAuthor) return { ok: false, code: "testimonialAuthorTooLong", index: i + 1 };
    if (!t.body) return { ok: false, code: "testimonialBodyRequired", index: i + 1 };
    if (charLength(t.body) > LIMITS.testimonialBody) return { ok: false, code: "testimonialBodyTooLong", index: i + 1 };
  }

  return {
    ok: true,
    value: { headline, bio, location, online: raw.online === true || raw.online === "1" || raw.online === "on", specializations, socials: socials.value, services, testimonials },
  };
}
