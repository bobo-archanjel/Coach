// FitPilot — validácia vstupov značky trénera (branding). Čistý modul (testy: e2e/branding.spec.ts).
// Platí rovnako pre server action aj živý náhľad. Texty sa čistia (orezanie, zákaz riadiacich
// a obojsmerných znakov), React ich pri vykreslení ešte raz escapuje — HTML sa nikdy nevkladá.

import { normalizeHex } from "./colors";

export const BRAND_NAME_MAX = 40;
export const WELCOME_TEXT_MAX = 300;
/** Max. veľkosť nahrávaného súboru (bajty) — zhodné s file_size_limit bucketu (0075). */
export const MAX_UPLOAD_BYTES = 1_000_000;

// riadiace znaky (okrem \n a \t, ktoré sa riešia zvlášť), zero-width a obojsmerné prepisy
const CONTROL_RE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F​-‏‪-‮⁠-⁩﻿]/g;

/** Odstráni nebezpečné znaky a zjednotí biele znaky na jednom riadku. */
export function cleanLine(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.normalize("NFC").replace(CONTROL_RE, "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

/** Ako cleanLine, ale zachová zalomenia riadkov (max. 2 prázdne riadky za sebou). */
export function cleanMultiline(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_RE, "")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Dĺžka v znakoch (nie v UTF-16 jednotkách — emoji = 1). */
export function charLength(s: string): number {
  return Array.from(s).length;
}

export type BrandingErrorCode = "brandNameTooLong" | "welcomeTooLong" | "accentInvalid";

export interface BrandingInput {
  brandName: string;
  welcomeText: string;
  /** null = predvolená farba FitPilot */
  accent: string | null;
}

export type BrandingValidation = { ok: true; value: BrandingInput } | { ok: false; code: BrandingErrorCode };

export function validateBranding(raw: { brandName: unknown; welcomeText: unknown; accent: unknown }): BrandingValidation {
  const brandName = cleanLine(raw.brandName);
  if (charLength(brandName) > BRAND_NAME_MAX) return { ok: false, code: "brandNameTooLong" };
  const welcomeText = cleanMultiline(raw.welcomeText);
  if (charLength(welcomeText) > WELCOME_TEXT_MAX) return { ok: false, code: "welcomeTooLong" };

  let accent: string | null = null;
  if (typeof raw.accent === "string" && raw.accent.trim() !== "") {
    accent = normalizeHex(raw.accent);
    if (!accent) return { ok: false, code: "accentInvalid" };
  }
  return { ok: true, value: { brandName, welcomeText, accent } };
}
