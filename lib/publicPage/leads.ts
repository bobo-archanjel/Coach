// FitPilot — záujemcovia (leady) z verejnej stránky trénera: validácia a čistenie formulára, stavy,
// rozhodnutie o limitoch odosielania. Čistý modul bez I/O (testy: e2e/public-page.spec.ts).
// Limity zrkadlí SQL reserve_lead_submit() z migrácie 0083 — pri zmene pravidiel upraviť OBE miesta.

import { charLength, cleanLine, cleanMultiline } from "@/lib/branding/validation";
import { normalizeEmail } from "@/lib/mail/sanitize";

export const LEAD_GOALS = ["weight_loss", "muscle_gain", "fitness", "health", "other"] as const;
export type LeadGoal = (typeof LEAD_GOALS)[number];
export const LEAD_EXPERIENCE = ["beginner", "intermediate", "advanced"] as const;
export type LeadExperience = (typeof LEAD_EXPERIENCE)[number];

export const LEAD_LIMITS_TEXT = {
  nameMin: 2,
  nameMax: 80,
  phoneMax: 25,
  availabilityMax: 120,
  messageMax: 1000,
  notesMax: 2000,
  /** najviac odkazov v správe (spam) */
  maxLinks: 2,
} as const;

export type LeadErrorCode =
  | "nameInvalid"
  | "emailInvalid"
  | "phoneInvalid"
  | "goalInvalid"
  | "experienceInvalid"
  | "availabilityTooLong"
  | "messageTooLong"
  | "tooManyLinks"
  | "consentRequired";

export interface LeadInput {
  name: string;
  email: string;
  phone: string | null;
  goal: LeadGoal;
  experience: LeadExperience;
  availability: string;
  message: string;
}

export type LeadValidation = { ok: true; value: LeadInput } | { ok: false; code: LeadErrorCode };

const inList = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/** Telefón: čísla, medzery, +, -, zátvorky; 7–15 číslic (E.164). Prázdny = bez telefónu. */
export function cleanPhone(input: unknown): { ok: true; value: string | null } | { ok: false } {
  if (typeof input !== "string" || input.trim() === "") return { ok: true, value: null };
  const v = input.normalize("NFC").trim();
  if (v.length > LEAD_LIMITS_TEXT.phoneMax || !/^\+?[0-9 ()./-]+$/.test(v)) return { ok: false };
  const digits = v.replace(/\D/g, "").length;
  if (digits < 7 || digits > 15) return { ok: false };
  return { ok: true, value: v.replace(/\s{2,}/g, " ") };
}

/** Počet odkazov v texte (http(s)://, www.) — spamové správy ich nesú viac. */
export function countLinks(text: string): number {
  return (text.match(/\b(?:https?:\/\/|www\.)\S+/gi) ?? []).length;
}

export function validateLead(raw: {
  name: unknown;
  email: unknown;
  phone: unknown;
  goal: unknown;
  experience: unknown;
  availability: unknown;
  message: unknown;
  consent: unknown;
}): LeadValidation {
  const name = cleanLine(raw.name);
  if (charLength(name) < LEAD_LIMITS_TEXT.nameMin || charLength(name) > LEAD_LIMITS_TEXT.nameMax) return { ok: false, code: "nameInvalid" };
  const email = normalizeEmail(raw.email);
  if (!email) return { ok: false, code: "emailInvalid" };
  const phone = cleanPhone(raw.phone);
  if (!phone.ok) return { ok: false, code: "phoneInvalid" };
  if (!inList(LEAD_GOALS, raw.goal)) return { ok: false, code: "goalInvalid" };
  if (!inList(LEAD_EXPERIENCE, raw.experience)) return { ok: false, code: "experienceInvalid" };
  const availability = cleanLine(raw.availability);
  if (charLength(availability) > LEAD_LIMITS_TEXT.availabilityMax) return { ok: false, code: "availabilityTooLong" };
  const message = cleanMultiline(raw.message);
  if (charLength(message) > LEAD_LIMITS_TEXT.messageMax) return { ok: false, code: "messageTooLong" };
  if (countLinks(message) + countLinks(availability) + countLinks(name) > LEAD_LIMITS_TEXT.maxLinks) return { ok: false, code: "tooManyLinks" };
  if (!(raw.consent === true || raw.consent === "1" || raw.consent === "on" || raw.consent === "true")) return { ok: false, code: "consentRequired" };
  return { ok: true, value: { name, email, phone: phone.value, goal: raw.goal, experience: raw.experience, availability, message } };
}

// ------------------------------------------------------------------ stavy záujemcu

export const LEAD_STATUSES = ["new", "contacted", "invited", "closed"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const isLeadStatus = (v: unknown): v is LeadStatus => inList(LEAD_STATUSES, v);

/**
 * Povolené zmeny stavu rukou trénera. Tréner môže stav posunúť ľubovoľne medzi „nový“, „kontaktovaný“
 * a „uzavretý“ (aj späť — omyl sa dá opraviť); stav „pozvaný“ nastavuje len odoslanie pozvánky (nie ručne),
 * aby zodpovedal tomu, čo sa naozaj stalo. Z „pozvaný“ sa dá ísť do „uzavretý“ alebo späť do „kontaktovaný“.
 */
export function canSetStatus(from: LeadStatus, to: LeadStatus): boolean {
  if (from === to) return false;
  if (to === "invited") return false; // len cez „Poslať pozvánku“
  return true;
}

/** Po odoslaní pozvánky: nový/kontaktovaný → pozvaný; už pozvaný ostáva; uzavretý sa neotvára znova. */
export function statusAfterInvite(from: LeadStatus): LeadStatus {
  return from === "closed" ? "closed" : "invited";
}

// ------------------------------------------------------------------ limity odosielania

export const LEAD_SUBMIT_LIMITS = {
  /** z jednej IP (hash) */
  perIpHour: 5,
  perIpDay: 15,
  /** na jedného trénera (poistka proti záplave) */
  perTrainerHour: 10,
  perTrainerDay: 40,
  /** tá istá adresa trénerovi najviac raz za toľko hodín */
  emailCooldownHours: 24,
} as const;

export interface LeadSubmitCounts {
  ipHour: number;
  ipDay: number;
  trainerHour: number;
  trainerDay: number;
  /** rovnaká e-mailová adresa tomu istému trénerovi v cooldown okne */
  emailInWindow: number;
}

export type LeadSubmitDecision = "ok" | "duplicate" | "ip_hour" | "ip_day" | "trainer_hour" | "trainer_day";

/** Poradie kontrol je rovnaké ako v SQL: duplicita → IP hodina → IP deň → tréner hodina → tréner deň. */
export function decideLeadSubmit(counts: LeadSubmitCounts, limits = LEAD_SUBMIT_LIMITS): LeadSubmitDecision {
  if (counts.emailInWindow > 0) return "duplicate";
  if (counts.ipHour >= limits.perIpHour) return "ip_hour";
  if (counts.ipDay >= limits.perIpDay) return "ip_day";
  if (counts.trainerHour >= limits.perTrainerHour) return "trainer_hour";
  if (counts.trainerDay >= limits.perTrainerDay) return "trainer_day";
  return "ok";
}

/** Záujemcovia sa po tomto čase automaticky mažú (GDPR, purge_old_leads v 0083). */
export const LEAD_RETENTION_MONTHS = 12;
