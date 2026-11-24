// FitPilot — dáta zdieľacej karty (story 1080×1920) z rekordu, odznaku, výzvy alebo týždenného
// súhrnu. Čisté funkcie bez servera a obrázkov (testy: e2e/gamification-b.spec.ts); samotné
// vykreslenie je v app/api/gamification/share/route.tsx.
//
// Súkromie: na karte je len krstné meno klienta, dátum a samotný úspech — nič iné
// (žiadne priezvisko, e-mail, váha ani údaje o tele). Značka: Business tréner má na karte svoje
// logo, názov a akcentovú farbu, ostatné tarify FitPilot.

import { DEFAULT_ACCENT } from "@/lib/branding/colors";
import type { PublicBranding } from "@/lib/branding/types";

export type ShareKind = "pr" | "badge" | "challenge" | "weekly";

export const SHARE_W = 1080;
export const SHARE_H = 1920;

export interface ShareBrand {
  name: string;
  /** verejná URL loga trénera (len Business) */
  logoUrl: string | null;
  /** akcentová farba karty (#rrggbb) */
  accent: string;
  /** farba textu NA akcentovej výplni */
  onAccent: string;
  /** true = predvolený FitPilot */
  isDefault: boolean;
}

export const DEFAULT_SHARE_BRAND: ShareBrand = {
  name: "FitPilot",
  logoUrl: null,
  accent: DEFAULT_ACCENT,
  onAccent: "#ffffff",
  isDefault: true,
};

/**
 * Značka na karte. `branding` je výsledok loadBrandingForTrainer — ten vracia hodnotu LEN pre
 * trénera s tarifou Business (inak null), takže sa tu tarifa už neráta znova.
 */
export function pickShareBrand(branding: PublicBranding | null | undefined): ShareBrand {
  if (!branding) return DEFAULT_SHARE_BRAND;
  const name = branding.brandName.trim();
  const dark = branding.theme?.dark;
  return {
    name: name || DEFAULT_SHARE_BRAND.name,
    logoUrl: branding.logoUrl,
    accent: dark?.accent ?? DEFAULT_SHARE_BRAND.accent,
    onAccent: dark?.on ?? DEFAULT_SHARE_BRAND.onAccent,
    isDefault: !name && !branding.logoUrl && !dark,
  };
}

/** Krstné meno (prvé slovo) — nič viac sa na kartu nedostane. */
export function firstNameOf(fullName: string | null | undefined): string {
  const first = (fullName ?? "").trim().split(/\s+/)[0] ?? "";
  return [...first.replace(/[^\p{L}\p{M}'’-]/gu, "")].slice(0, 24).join("");
}

export interface ShareAchievementRow {
  kind: "pr" | "badge" | "challenge";
  badgeId: string | null;
  exerciseName: string | null;
  value: number | null;
  reps: number | null;
  achievedOn: string;
  meta: { challenge_name?: unknown; metric?: unknown; target?: unknown } | null;
}

export interface ShareCardData {
  kind: ShareKind;
  firstName: string;
  /** ISO dátum úspechu (karta ho zformátuje v jazyku používateľa) */
  date: string;
  brand: ShareBrand;
  /** PR */
  exerciseName?: string;
  weightKg?: number;
  reps?: number | null;
  /** odznak */
  badgeId?: string;
  /** výzva */
  challengeName?: string;
  /** týždenný súhrn */
  weekly?: { weekStart: string; workouts: number; target: number; prs: number; volumeKg: number; badges: number; streakWeeks: number };
}

/** Karta z jedného úspechu; `null` = riadok nemá zobraziteľný tvar. */
export function pickAchievementCard(row: ShareAchievementRow, firstName: string, brand: ShareBrand): ShareCardData | null {
  const base = { firstName, date: row.achievedOn, brand };
  if (row.kind === "pr") {
    if (!row.exerciseName || row.value == null) return null;
    return { ...base, kind: "pr", exerciseName: row.exerciseName, weightKg: row.value, reps: row.reps };
  }
  if (row.kind === "badge") {
    if (!row.badgeId) return null;
    return { ...base, kind: "badge", badgeId: row.badgeId };
  }
  const name = typeof row.meta?.challenge_name === "string" ? row.meta.challenge_name.slice(0, 80) : "";
  if (!name) return null;
  return { ...base, kind: "challenge", challengeName: name };
}

export function pickWeeklyCard(
  w: NonNullable<ShareCardData["weekly"]>,
  weekEnd: string,
  firstName: string,
  brand: ShareBrand,
): ShareCardData {
  return { kind: "weekly", firstName, date: weekEnd, brand, weekly: w };
}
